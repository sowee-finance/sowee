package server

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/accounts"
	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/ethereum/go-ethereum/crypto"

	"github.com/sowee-finance/sowee/apps/api/internal/config"
	"github.com/sowee-finance/sowee/apps/api/internal/hcs"
	"github.com/sowee-finance/sowee/apps/api/internal/kyc"
	"github.com/sowee-finance/sowee/apps/api/internal/quote"
)

// stubSumsub keeps one applicant in memory and flips it GREEN on demand.
type stubSumsub struct{ app *kyc.Applicant }

func (s *stubSumsub) AccessToken(context.Context, string, time.Duration) (string, error) {
	return "sdk-token", nil
}
func (s *stubSumsub) Applicant(context.Context, string) (kyc.Applicant, error) {
	if s.app == nil {
		return kyc.Applicant{}, kyc.ErrNotFound
	}
	return *s.app, nil
}
func (s *stubSumsub) CreateApplicant(context.Context, string) (string, error) {
	s.app = &kyc.Applicant{ID: "app1", Answers: kyc.Answers{}}
	return "app1", nil
}
func (s *stubSumsub) SetFixedInfo(context.Context, string, kyc.FixedInfo) error { return nil }
func (s *stubSumsub) SubmitQuestionnaire(_ context.Context, _ string, a kyc.Answers) error {
	s.app.Answers = a
	return nil
}

type stubGrantor struct{ n int }

func (g *stubGrantor) Grant(context.Context, string) ([]string, error) {
	g.n++
	return []string{"0xgrant"}, nil
}

func (g *stubGrantor) Revoke(context.Context, string) ([]string, error) { return nil, nil }

const kycPk = "00000000000000000000000000000000000000000000000000000000000b0b0b"

func kycServer(t *testing.T, sumsub kyc.SumsubAPI, g kyc.Grantor, secret string) (http.Handler, *kyc.Flow, string) {
	t.Helper()
	signer, _ := quoteSigner(t)
	flow := kyc.NewFlow(sumsub, g)
	h := New(config.Config{ChainID: 296, DiscountOracle: testOracle, SumsubWebhookSecret: secret},
		Deps{Signer: signer, Anchor: hcs.New("", nil), KYC: flow})
	key, _ := crypto.HexToECDSA(kycPk)
	return h, flow, crypto.PubkeyToAddress(key.PublicKey).Hex()
}

func signed(t *testing.T, wallet string) (issuedAt, sig string) {
	t.Helper()
	at := time.Now().UTC().Truncate(time.Second)
	key, _ := crypto.HexToECDSA(kycPk)
	raw, _ := crypto.Sign(accounts.TextHash([]byte(kyc.ChallengeMessage(wallet, at))), key)
	raw[64] += 27
	return at.Format(time.RFC3339), hexutil.Encode(raw)
}

func TestKYCChallengeAndSession(t *testing.T) {
	h, _, wallet := kycServer(t, &stubSumsub{}, nil, "")
	rec := do(h, http.MethodGet, "/v1/kyc/challenge?wallet="+wallet, "")
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "Sowee KYC session") {
		t.Fatalf("challenge: %d %s", rec.Code, rec.Body)
	}
	rec = do(h, http.MethodGet, "/v1/kyc/challenge?wallet=nope", "")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("bad wallet: want 400, got %d", rec.Code)
	}

	at, sig := signed(t, wallet)
	rec = do(h, http.MethodPost, "/v1/kyc/session", `{"wallet":"`+wallet+`","issuedAt":"`+at+`","signature":"`+sig+`"}`)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "sdk-token") {
		t.Fatalf("session: %d %s", rec.Code, rec.Body)
	}
	// wrong wallet for that signature → 401
	rec = do(h, http.MethodPost, "/v1/kyc/session", `{"wallet":"0x000000000000000000000000000000000000dEaD","issuedAt":"`+at+`","signature":"`+sig+`"}`)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("forged session: want 401, got %d", rec.Code)
	}
	// no signature at all → 401
	rec = do(h, http.MethodPost, "/v1/kyc/session", `{"wallet":"`+wallet+`"}`)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("unsigned session: want 401, got %d", rec.Code)
	}
}

func TestKYCProfileStatusAndWebhookDriveTheGrant(t *testing.T) {
	sumsub := &stubSumsub{}
	g := &stubGrantor{}
	h, flow, wallet := kycServer(t, sumsub, g, "whsec")

	at, sig := signed(t, wallet)
	body, _ := json.Marshal(map[string]any{
		"wallet": wallet, "issuedAt": at, "signature": sig,
		"profile": map[string]string{"firstName": "Ana", "lastName": "Test", "dob": "1990-01-01", "country": "IDN"},
		"answers": map[string]string{
			"jurisdiction.residence": "IDN", "jurisdiction.us_person": "false", "jurisdiction.sanctioned": "false",
			"classification.investor_class": "professional", "aml.source_of_funds": "salary", "aml.pep": "false", "aml.beneficial_owner": "true",
		},
	})
	rec := do(h, http.MethodPost, "/v1/kyc/profile", string(body))
	if rec.Code != http.StatusAccepted || !strings.Contains(rec.Body.String(), `"state":"pending"`) {
		t.Fatalf("profile: %d %s", rec.Code, rec.Body)
	}

	// Sumsub reviews GREEN and calls the webhook
	sumsub.app.Review = kyc.Review{Status: "completed", Answer: "GREEN"}
	event := []byte(`{"type":"applicantReviewed","externalUserId":"` + strings.ToLower(wallet) + `","reviewResult":{"reviewAnswer":"GREEN"}}`)
	req := httptest.NewRequest(http.MethodPost, "/v1/kyc/webhook", strings.NewReader(string(event)))
	req.Header.Set("x-payload-digest", "deadbeef")
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("bad digest: want 401, got %d", rec.Code)
	}
	m := hmac.New(sha256.New, []byte("whsec"))
	m.Write(event)
	req = httptest.NewRequest(http.MethodPost, "/v1/kyc/webhook", strings.NewReader(string(event)))
	req.Header.Set("x-payload-digest", hex.EncodeToString(m.Sum(nil)))
	req.Header.Set("x-payload-digest-alg", "HMAC_SHA256_HEX")
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"granting"`) {
		t.Fatalf("webhook: %d %s", rec.Code, rec.Body)
	}
	flow.Wait()
	rec = do(h, http.MethodGet, "/v1/kyc/status?wallet="+wallet, "")
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"state":"granted"`) || g.n != 1 {
		t.Fatalf("status: %d %s grants=%d", rec.Code, rec.Body, g.n)
	}
	if strings.Contains(rec.Body.String(), "Ana") {
		t.Fatal("status must not leak personal data")
	}
}

func TestKYCBlockedNeverGranted(t *testing.T) {
	sumsub := &stubSumsub{}
	g := &stubGrantor{}
	h, flow, wallet := kycServer(t, sumsub, g, "")
	at, sig := signed(t, wallet)
	body, _ := json.Marshal(map[string]any{
		"wallet": wallet, "issuedAt": at, "signature": sig,
		"answers": map[string]string{
			"jurisdiction.residence": "USA", "jurisdiction.us_person": "true", "jurisdiction.sanctioned": "false",
			"classification.investor_class": "retail", "aml.source_of_funds": "salary", "aml.pep": "false", "aml.beneficial_owner": "true",
		},
	})
	do(h, http.MethodPost, "/v1/kyc/profile", string(body))
	sumsub.app.Review = kyc.Review{Answer: "GREEN"}
	rec := do(h, http.MethodGet, "/v1/kyc/status?wallet="+wallet, "")
	flow.Wait()
	if !strings.Contains(rec.Body.String(), `"state":"blocked"`) || g.n != 0 {
		t.Fatalf("us person: %s grants=%d", rec.Body, g.n)
	}
}

func TestKYCDisabledIs503(t *testing.T) {
	h, _, wallet := kycServer(t, nil, nil, "")
	rec := do(h, http.MethodGet, "/v1/kyc/status?wallet="+wallet, "")
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("want 503, got %d", rec.Code)
	}
}

func quoteSigner(t *testing.T) (*quote.Signer, error) {
	t.Helper()
	return quote.NewSigner(testKey, 296, testOracle)
}
