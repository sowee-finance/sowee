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
	return json.RawMessage(`{"protocol_version":"4.0","nonce":"0x01","action":"` + action + `","environment":"staging","responses":[{"identifier":"selfie_check","proof":["0x00"],"nullifier":"` + nullifier + `"}]}`)
}

func TestNewRequestCarriesASignedContext(t *testing.T) {
	s := newService(t, func(http.ResponseWriter, *http.Request) {})
	r, err := s.NewRequest()
	if err != nil {
		t.Fatal(err)
	}
	if r.AppID != "app_1" || r.RPID != "rp_1" || r.Action != "sowee-selfie-check" || r.Environment != "staging" {
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
	n, err := s.Verify(context.Background(), "0xwallet", payload("sowee-selfie-check", "0xabc"))
	if err != nil || n != "0xabc" {
		t.Fatalf("verify: %v %q", err, n)
	}
	if seenPath != "/rp_1" || seenBody["action"] != "sowee-selfie-check" {
		t.Fatalf("payload not forwarded as-is: %s %v", seenPath, seenBody)
	}
	if _, err := s.Verify(context.Background(), "0xwallet", payload("sowee-selfie-check", "0xabc")); !errors.Is(err, ErrReplay) {
		t.Fatalf("want replay error, got %v", err)
	}
}

func TestVerifyAcceptsWorldId3Result(t *testing.T) {
	s := newService(t, func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(`{"success":true}`)) })
	v3 := json.RawMessage(`{"protocol_version":"3.0","nonce":"0x01","action":"sowee-selfie-check","environment":"sandbox","responses":[{"identifier":"selfie_check","proof":"0x00","merkle_root":"0x01","nullifier_hash":"0xv3","verification_level":"selfie"}]}`)
	n, err := s.Verify(context.Background(), "0xwallet", v3)
	if err != nil || n != "0xv3" {
		t.Fatalf("v3 result: %v %q", err, n)
	}
}

func TestVerifyRejections(t *testing.T) {
	s := newService(t, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"code":"invalid_proof","detail":"proof is not valid","attribute":"proof"}`))
	})
	if _, err := s.Verify(context.Background(), "0xwallet", payload("other-action", "0x1")); !errors.Is(err, ErrWrongAction) {
		t.Fatalf("want wrong action, got %v", err)
	}
	_, err := s.Verify(context.Background(), "0xwallet", payload("sowee-selfie-check", "0x2"))
	if !errors.Is(err, ErrInvalid) || !strings.Contains(err.Error(), "proof is not valid") {
		t.Fatalf("want invalid with portal detail, got %v", err)
	}
	if _, err := s.Verify(context.Background(), "0xwallet", json.RawMessage(`{"action":"sowee-selfie-check"}`)); !errors.Is(err, ErrInvalid) {
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

// "sandbox" is in IDKit's type union but not in World's API, which answers
// `environment must be one of the following values: production, staging`. A service that accepts
// it hands out invite codes no phone can resolve, so it has to fail here instead.
func TestEnvironmentMustBeOneWorldAccepts(t *testing.T) {
	for _, env := range []string{"sandbox", "test", "prod"} {
		if _, err := New(Config{AppID: "a", RPID: "r", SigningKeyHex: key, Environment: env}); err == nil {
			t.Fatalf("%q must be refused", env)
		}
	}
	for _, env := range []string{"production", "staging"} {
		s, err := New(Config{AppID: "a", RPID: "r", SigningKeyHex: key, Environment: env})
		if err != nil || s.cfg.Environment != env {
			t.Fatalf("%q must be kept: %v", env, err)
		}
	}
}

// The binding is what makes "one person, one wallet" mean anything: a nullifier is spent on a
// wallet, and both directions can be read back.
func TestVerifyBindsTheNullifierToTheWallet(t *testing.T) {
	s := newService(t, func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(`{"success":true}`)) })
	n, err := s.Verify(context.Background(), "0xAbC", payload("sowee-selfie-check", "0xnull"))
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if got := s.WalletFor(n); got != "0xabc" {
		t.Fatalf("WalletFor = %q, want the lowercased wallet", got)
	}
	if got := s.HumanFor("0xABC"); got != n {
		t.Fatalf("HumanFor = %q, want %q — the lookup has to be case-insensitive too", got, n)
	}
	if got := s.HumanFor("0xsomeoneelse"); got != "" {
		t.Fatalf("HumanFor of an unverified wallet = %q, want empty", got)
	}
}

// A restart must reach the same answer: the topic is replayed oldest-first, and the first
// binding for a World ID is the one that stands.
func TestRestoreRebuildsTheBindingAndTheFirstOneWins(t *testing.T) {
	s := newService(t, func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(`{"success":true}`)) })
	spent := s.Restore([]Pass{
		{Nullifier: "0xnull", Wallet: "0xFirst"},
		{Nullifier: "0xnull", Wallet: "0xSecond"}, // cannot happen live; the topic is the record
		{Nullifier: "", Wallet: "0xignored"},
	})
	if spent != 1 {
		t.Fatalf("restored %d nullifiers, want 1", spent)
	}
	if got := s.WalletFor("0xnull"); got != "0xfirst" {
		t.Fatalf("WalletFor = %q, want the first binding to stand", got)
	}
	// And a restored nullifier is spent: the whole point of replaying it.
	if _, err := s.Verify(context.Background(), "0xthird", payload("sowee-selfie-check", "0xnull")); !errors.Is(err, ErrReplay) {
		t.Fatalf("verify after restore = %v, want ErrReplay", err)
	}
}

func TestNullifierOfReadsAResultWithoutVerifying(t *testing.T) {
	if got := NullifierOf(payload("sowee-selfie-check", "0xnull")); got != "0xnull" {
		t.Fatalf("NullifierOf = %q, want 0xnull", got)
	}
	if got := NullifierOf(json.RawMessage(`not json`)); got != "" {
		t.Fatalf("NullifierOf of junk = %q, want empty", got)
	}
}
