package ratelimit

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestTiers(t *testing.T) {
	verified := map[string]bool{"0xaaa": true}
	l := New(2, 5, func(w string) bool { return verified[w] }, false)
	// This test is about the tiers, not about how control is proved: stand in for the signed
	// challenge the server wires up. Without a prover nobody reaches the verified rate at all.
	l.Prove = func(r *http.Request) string { return r.URL.Query().Get("wallet") }
	now := time.Date(2026, 9, 6, 12, 0, 0, 0, time.UTC)
	l.now = func() time.Time { return now }
	h := l.Middleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(200) }))

	hit := func(wallet string) int {
		req := httptest.NewRequest(http.MethodGet, "/v1/kyc/status?wallet="+wallet, nil)
		req.RemoteAddr = "10.0.0.1:1234"
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec.Code
	}
	// unverified: 2 per minute by IP
	if hit("0xbbb") != 200 || hit("0xbbb") != 200 || hit("0xbbb") != 429 {
		t.Fatal("unverified wallet should be limited after 2 requests")
	}
	// verified wallet has its own bucket of 5 even from the same IP
	for i := 0; i < 5; i++ {
		if hit("0xaaa") != 200 {
			t.Fatalf("verified request %d limited", i)
		}
	}
	if hit("0xaaa") != 429 {
		t.Fatal("verified wallet should be limited after 5")
	}
	// tokens refill with time
	now = now.Add(time.Minute)
	if hit("0xbbb") != 200 {
		t.Fatal("bucket should refill after a minute")
	}
}

func TestForwardedForIsIgnoredUnlessTrusted(t *testing.T) {
	l := New(1, 1, nil, false)
	h := l.Middleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(200) }))
	codes := []int{}
	for i := 0; i < 3; i++ {
		req := httptest.NewRequest(http.MethodGet, "/x", nil)
		req.RemoteAddr = "10.0.0.9:1"
		req.Header.Set("X-Forwarded-For", "1.2.3."+string(rune('0'+i)))
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		codes = append(codes, rec.Code)
	}
	if codes[1] != http.StatusTooManyRequests {
		t.Fatalf("spoofed XFF must not reset the bucket: %v", codes)
	}
}

func TestIdleBucketsAreDropped(t *testing.T) {
	l := New(5, 5, nil, false)
	now := time.Date(2026, 9, 7, 12, 0, 0, 0, time.UTC)
	l.now = func() time.Time { return now }
	l.Allow("ip:1.2.3.4", 5)
	l.Allow("ip:5.6.7.8", 5)
	if len(l.buckets) != 2 {
		t.Fatalf("want 2 buckets, got %d", len(l.buckets))
	}
	// One client keeps going; the other goes quiet and its bucket is reclaimed.
	now = now.Add(idleTTL + time.Minute)
	l.Allow("ip:1.2.3.4", 5)
	if len(l.buckets) != 1 {
		t.Fatalf("idle bucket not swept: %d remain", len(l.buckets))
	}
	if _, alive := l.buckets["ip:1.2.3.4"]; !alive {
		t.Fatal("the active bucket was swept")
	}
}

// Verified wallets are public on chain, so naming one is free. The larger allowance has to
// require proof of control, not a header anyone can set.
func TestTheVerifiedTierNeedsProofNotAClaim(t *testing.T) {
	const wallet = "0xabc"
	lim := New(1, 5, func(w string) bool { return w == wallet }, false)
	// Only a request carrying the right secret has proved anything.
	lim.Prove = func(r *http.Request) string {
		if r.Header.Get("X-Wallet-Signature") == "real" {
			return r.Header.Get("X-Wallet")
		}
		return ""
	}
	ok := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	h := lim.Middleware(ok)

	call := func(from, sig string) int {
		req := httptest.NewRequest(http.MethodGet, "/v1/market/insights", nil)
		req.RemoteAddr = from + ":1234"
		req.Header.Set("X-Wallet", wallet)
		if sig != "" {
			req.Header.Set("X-Wallet-Signature", sig)
		}
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec.Code
	}

	// Naming the wallet without proof buys the base rate: one call, then refused.
	if c := call("10.0.0.1", ""); c != http.StatusOK {
		t.Fatalf("stranger call 1: %d", c)
	}
	if c := call("10.0.0.1", ""); c != http.StatusTooManyRequests {
		t.Fatalf("a claimed wallet must not lift the limit: %d", c)
	}
	// The stranger has also spent nothing the owner had: proof gets the full allowance.
	for i := range 5 {
		if c := call("192.168.1.1", "real"); c != http.StatusOK {
			t.Fatalf("owner call %d: %d", i+1, c)
		}
	}
	if c := call("192.168.1.1", "real"); c != http.StatusTooManyRequests {
		t.Fatalf("the owner's own allowance is unbounded: %d", c)
	}
}

// With no way to prove anything, nobody reaches the larger allowance at all.
func TestWithoutAProverEveryoneGetsTheBaseRate(t *testing.T) {
	lim := New(1, 100, func(string) bool { return true }, false)
	h := lim.Middleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {}))
	call := func() int {
		req := httptest.NewRequest(http.MethodGet, "/x", nil)
		req.RemoteAddr = "10.0.0.9:1"
		req.Header.Set("X-Wallet", "0xabc")
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec.Code
	}
	if c := call(); c != http.StatusOK {
		t.Fatalf("first call: %d", c)
	}
	if c := call(); c != http.StatusTooManyRequests {
		t.Fatalf("Prove is nil, so the verified tier must be unreachable: %d", c)
	}
}
