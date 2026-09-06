package server

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

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
