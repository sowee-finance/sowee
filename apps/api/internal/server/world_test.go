package server

import (
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
	"github.com/sowee-finance/sowee/apps/api/internal/world"
)

func worldServer(t *testing.T, portal http.HandlerFunc) (http.Handler, *kyc.Flow, string) {
	t.Helper()
	srv := httptest.NewServer(portal)
	t.Cleanup(srv.Close)
	ws, err := world.New(world.Config{AppID: "app_1", RPID: "rp_1", SigningKeyHex: strings.Repeat("22", 32), VerifyBase: srv.URL})
	if err != nil {
		t.Fatal(err)
	}
	signer, _ := quoteSigner(t)
	flow := kyc.NewFlow(&stubSumsub{}, nil)
	h := New(config.Config{ChainID: 296, DiscountOracle: testOracle, RateBase: 100, RateVerified: 100},
		Deps{Signer: signer, Anchor: hcs.New("", nil), KYC: flow, World: ws})
	key := mustKey(t)
	return h, flow, key
}

func mustKey(t *testing.T) string {
	t.Helper()
	_, _, wallet := kycServer(t, &stubSumsub{}, nil, "")
	return wallet
}

func TestWorldRequestAndVerifyFlipTheSignalAndGateTheFaucet(t *testing.T) {
	h, flow, wallet := worldServer(t, func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(`{"success":true}`)) })

	rec := do(h, http.MethodGet, "/v1/world/request", "")
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"rp_context"`) || !strings.Contains(rec.Body.String(), `"app_1"`) {
		t.Fatalf("request: %d %s", rec.Code, rec.Body)
	}

	at, sig := signed(t, wallet)
	// faucet before the signal → 403
	rec = do(h, http.MethodPost, "/v1/faucet", `{"wallet":"`+wallet+`","issuedAt":"`+at+`","signature":"`+sig+`"}`)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("faucet before selfie check: want 403, got %d", rec.Code)
	}

	result := `{"protocol_version":"4.0","action":"sowee-selfie-check","responses":[{"identifier":"selfie_check","proof":["0x0"],"nullifier":"0x99"}]}`
	rec = do(h, http.MethodPost, "/v1/world/verify", `{"wallet":"`+wallet+`","issuedAt":"`+at+`","signature":"`+sig+`","result":`+result+`}`)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"selfieCheck":true`) {
		t.Fatalf("verify: %d %s", rec.Code, rec.Body)
	}
	if !flow.SelfieCheck(wallet) {
		t.Fatal("signal not recorded on the flow")
	}
	rec = do(h, http.MethodGet, "/v1/kyc/status?wallet="+wallet, "")
	if !strings.Contains(rec.Body.String(), `"selfieCheck":true`) {
		t.Fatalf("status should expose the signal: %s", rec.Body)
	}
	// same proof again → 409
	rec = do(h, http.MethodPost, "/v1/world/verify", `{"wallet":"`+wallet+`","issuedAt":"`+at+`","signature":"`+sig+`","result":`+result+`}`)
	if rec.Code != http.StatusConflict {
		t.Fatalf("replay: want 409, got %d", rec.Code)
	}
	// faucet after the signal but with no faucet configured → 503 (the gate passed)
	rec = do(h, http.MethodPost, "/v1/faucet", `{"wallet":"`+wallet+`","issuedAt":"`+at+`","signature":"`+sig+`"}`)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("faucet after selfie check: want 503 (disabled), got %d %s", rec.Code, rec.Body)
	}
}

func TestWorldVerifyRejectsPortalFailure(t *testing.T) {
	h, _, wallet := worldServer(t, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"code":"invalid_proof","detail":"proof is not valid"}`))
	})
	at, sig := signed(t, wallet)
	result := `{"action":"sowee-selfie-check","responses":[{"nullifier":"0x1"}]}`
	rec := do(h, http.MethodPost, "/v1/world/verify", `{"wallet":"`+wallet+`","issuedAt":"`+at+`","signature":"`+sig+`","result":`+result+`}`)
	if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "proof is not valid") {
		t.Fatalf("want 400 with portal detail, got %d %s", rec.Code, rec.Body)
	}
}

func TestWorldDisabledIs503(t *testing.T) {
	h, _, _ := kycServer(t, &stubSumsub{}, nil, "")
	rec := do(h, http.MethodGet, "/v1/world/request", "")
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("want 503, got %d", rec.Code)
	}
}

func TestUnverifiedTrafficIsRateLimited(t *testing.T) {
	signer, _ := quoteSigner(t)
	h := New(config.Config{ChainID: 296, DiscountOracle: testOracle, RateBase: 2, RateVerified: 50},
		Deps{Signer: signer, Anchor: hcs.New("", nil), KYC: kyc.NewFlow(&stubSumsub{}, nil)})
	codes := []int{}
	for i := 0; i < 3; i++ {
		req := httptest.NewRequest(http.MethodGet, "/v1/kyc/status?wallet=0x000000000000000000000000000000000000dEaD", nil)
		req.RemoteAddr = "203.0.113.7:9"
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		codes = append(codes, rec.Code)
	}
	if codes[2] != http.StatusTooManyRequests {
		t.Fatalf("third unverified request should be 429, got %v", codes)
	}
}

// signedBy produces a wallet and its challenge signature from an arbitrary key, so a test can
// have a second person at the door.
func signedBy(t *testing.T, pk string) (wallet, issuedAt, sig string) {
	t.Helper()
	key, err := crypto.HexToECDSA(pk)
	if err != nil {
		t.Fatal(err)
	}
	wallet = crypto.PubkeyToAddress(key.PublicKey).Hex()
	at := time.Now().UTC().Truncate(time.Second)
	raw, _ := crypto.Sign(accounts.TextHash([]byte(kyc.ChallengeMessage(wallet, at))), key)
	raw[64] += 27
	return wallet, at.Format(time.RFC3339), hexutil.Encode(raw)
}

// The property the whole feature rests on: one World ID reaches one wallet. The second wallet
// holds a valid signature and a valid proof — it is refused because the proof is already spent,
// and the refusal names the wallet it was spent on, which is the only useful thing to say to
// someone who is holding that World ID.
func TestOneWorldIDReachesOneWallet(t *testing.T) {
	h, flow, first := worldServer(t, func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(`{"success":true}`)) })
	proof := `{"protocol_version":"4.0","action":"sowee-selfie-check","responses":[{"identifier":"selfie_check","proof":["0x0"],"nullifier":"0xsamehuman"}]}`

	at, sig := signed(t, first)
	rec := do(h, http.MethodPost, "/v1/world/verify", `{"wallet":"`+first+`","issuedAt":"`+at+`","signature":"`+sig+`","result":`+proof+`}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("first wallet: %d %s", rec.Code, rec.Body)
	}

	second, at2, sig2 := signedBy(t, strings.Repeat("33", 32))
	rec = do(h, http.MethodPost, "/v1/world/verify", `{"wallet":"`+second+`","issuedAt":"`+at2+`","signature":"`+sig2+`","result":`+proof+`}`)
	if rec.Code != http.StatusConflict {
		t.Fatalf("second wallet with the same World ID: want 409, got %d %s", rec.Code, rec.Body)
	}
	if !strings.Contains(strings.ToLower(rec.Body.String()), strings.ToLower(first)) {
		t.Fatalf("the refusal should name the wallet the proof is bound to, got %s", rec.Body)
	}
	if flow.SelfieCheck(second) {
		t.Fatal("the second wallet must not carry the signal")
	}
}

// A pass that could not be anchored is still a pass — the caller cannot retry, because the proof
// is already spent — but it says so, because until it is anchored the one-person rule only holds
// for as long as this process does.
func TestVerifyReportsWhetherThePassWasAnchored(t *testing.T) {
	h, _, wallet := worldServer(t, func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(`{"success":true}`)) })
	at, sig := signed(t, wallet)
	result := `{"protocol_version":"4.0","action":"sowee-selfie-check","responses":[{"identifier":"selfie_check","proof":["0x0"],"nullifier":"0xnotanchored"}]}`

	rec := do(h, http.MethodPost, "/v1/world/verify", `{"wallet":"`+wallet+`","issuedAt":"`+at+`","signature":"`+sig+`","result":`+result+`}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("verify: %d %s", rec.Code, rec.Body)
	}
	// The harness runs with the anchor disabled, which is the same shape as a failed write.
	if !strings.Contains(rec.Body.String(), `"anchored":false`) {
		t.Fatalf("an unanchored pass must say so, got %s", rec.Body)
	}
}
