package world

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const key = "1111111111111111111111111111111111111111111111111111111111111111"

func newService(t *testing.T, verify http.HandlerFunc) *Service {
	t.Helper()
	srv := httptest.NewServer(verify)
	t.Cleanup(srv.Close)
	s, err := New(Config{AppID: "app_1", RPID: "rp_1", SigningKeyHex: key, VerifyBase: srv.URL})
	if err != nil || s == nil {
		t.Fatalf("service: %v %v", s, err)
	}
	return s
}

func payload(action, nullifier string) json.RawMessage {
	return json.RawMessage(`{"protocol_version":"4.0","nonce":"0x01","action":"` + action + `","environment":"sandbox","responses":[{"identifier":"selfie_check","proof":["0x00"],"nullifier":"` + nullifier + `"}]}`)
}

func TestNewRequestCarriesASignedContext(t *testing.T) {
	s := newService(t, func(http.ResponseWriter, *http.Request) {})
	r, err := s.NewRequest()
	if err != nil {
		t.Fatal(err)
	}
	if r.AppID != "app_1" || r.RPID != "rp_1" || r.Action != "sowee-selfie-check" || r.Environment != "sandbox" {
		t.Fatalf("unexpected request %+v", r)
	}
	if !strings.HasPrefix(r.RPContext.Sig, "0x") || len(r.RPContext.Sig) != 132 || r.RPContext.ExpiresAt <= r.RPContext.CreatedAt {
		t.Fatalf("bad rp context %+v", r.RPContext)
	}
}

func TestVerifyForwardsPayloadAndBlocksReplay(t *testing.T) {
	var seenPath string
	var seenBody map[string]any
	s := newService(t, func(w http.ResponseWriter, r *http.Request) {
		seenPath = r.URL.Path
		_ = json.NewDecoder(r.Body).Decode(&seenBody)
		_, _ = w.Write([]byte(`{"success":true}`))
	})
	n, err := s.Verify(context.Background(), payload("sowee-selfie-check", "0xabc"))
	if err != nil || n != "0xabc" {
		t.Fatalf("verify: %v %q", err, n)
	}
	if seenPath != "/rp_1" || seenBody["action"] != "sowee-selfie-check" {
		t.Fatalf("payload not forwarded as-is: %s %v", seenPath, seenBody)
	}
	if _, err := s.Verify(context.Background(), payload("sowee-selfie-check", "0xabc")); !errors.Is(err, ErrReplay) {
		t.Fatalf("want replay error, got %v", err)
	}
}

func TestVerifyRejections(t *testing.T) {
	s := newService(t, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"code":"invalid_proof","detail":"proof is not valid","attribute":"proof"}`))
	})
	if _, err := s.Verify(context.Background(), payload("other-action", "0x1")); !errors.Is(err, ErrWrongAction) {
		t.Fatalf("want wrong action, got %v", err)
	}
	_, err := s.Verify(context.Background(), payload("sowee-selfie-check", "0x2"))
	if !errors.Is(err, ErrInvalid) || !strings.Contains(err.Error(), "proof is not valid") {
		t.Fatalf("want invalid with portal detail, got %v", err)
	}
	if _, err := s.Verify(context.Background(), json.RawMessage(`{"action":"sowee-selfie-check"}`)); !errors.Is(err, ErrInvalid) {
		t.Fatalf("want invalid for a result without responses, got %v", err)
	}
}

func TestDisabledAndBadKey(t *testing.T) {
	s, err := New(Config{})
	if err != nil || s != nil || s.Enabled() {
		t.Fatal("incomplete config must yield a nil, disabled service")
	}
	if _, err := s.NewRequest(); !errors.Is(err, ErrDisabled) {
		t.Fatal("nil service must report disabled")
	}
	if _, err := New(Config{AppID: "a", RPID: "r", SigningKeyHex: "zz"}); err == nil {
		t.Fatal("bad key must error")
	}
}
