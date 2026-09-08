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

// Verified wallets are public on chain, so anyone can put one in X-Wallet. They must not be able
// to spend the allowance that wallet's owner earned.
func TestNamingAVerifiedWalletCannotDrainItsOwner(t *testing.T) {
	const wallet = "0xabc"
	lim := New(1, 2, func(w string) bool { return w == wallet }, false)
	ok := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	h := lim.Middleware(ok)

	call := func(from string) int {
		req := httptest.NewRequest(http.MethodGet, "/v1/market/insights", nil)
		req.RemoteAddr = from + ":1234"
		req.Header.Set("X-Wallet", wallet)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec.Code
	}

	// A stranger spends its own two calls under that wallet's name.
	if c := call("10.0.0.1"); c != http.StatusOK {
		t.Fatalf("stranger call 1: %d", c)
	}
	if c := call("10.0.0.2"); c != http.StatusOK {
		t.Fatalf("stranger call 2: %d", c)
	}
	if c := call("10.0.0.1"); c != http.StatusOK {
		t.Fatalf("stranger call 3: %d", c)
	}
	// The owner still has a full allowance of its own.
	if c := call("192.168.1.1"); c != http.StatusOK {
		t.Fatalf("owner call 1: %d", c)
	}
	if c := call("192.168.1.1"); c != http.StatusOK {
		t.Fatalf("owner call 2: %d", c)
	}
	if c := call("192.168.1.1"); c != http.StatusTooManyRequests {
		t.Fatalf("owner is still rate limited on its own bucket: %d", c)
	}
}
