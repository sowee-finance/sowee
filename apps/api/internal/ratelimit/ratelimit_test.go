package ratelimit

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestTiers(t *testing.T) {
	verified := map[string]bool{"0xaaa": true}
	l := New(2, 5, func(w string) bool { return verified[w] })
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
