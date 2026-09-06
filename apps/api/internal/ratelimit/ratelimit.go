// Package ratelimit is a small in-memory token bucket with two tiers: a base allowance per
// client, and a larger one for wallets that passed the Selfie Check signal.
package ratelimit

import (
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Tiered decides the per-minute allowance for a request.
type Tiered struct {
	Base       int                      // requests per minute for anyone
	Verified   int                      // requests per minute for verified wallets
	IsVerified func(wallet string) bool // signal lookup; nil means nobody is verified
	TrustProxy bool                     // honour X-Forwarded-For (only behind our own proxy)
	now        func() time.Time
	mu         sync.Mutex
	buckets    map[string]*bucket
	lastSweep  time.Time
}

type bucket struct {
	tokens float64
	last   time.Time
}

// A bucket refills completely after one minute, so anything untouched for longer carries no
// information. Sweeping them keeps the map bounded by live traffic rather than by uptime.
const idleTTL = 10 * time.Minute

// New builds a limiter; rates are per minute.
func New(base, verified int, isVerified func(string) bool, trustProxy bool) *Tiered {
	return &Tiered{Base: base, Verified: verified, IsVerified: isVerified, TrustProxy: trustProxy, now: time.Now, buckets: map[string]*bucket{}}
}

// Allow consumes one token for key at the given per-minute rate.
func (t *Tiered) Allow(key string, perMinute int) bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	now := t.now()
	b := t.buckets[key]
	if b == nil {
		b = &bucket{tokens: float64(perMinute), last: now}
		t.buckets[key] = b
	}
	b.tokens += now.Sub(b.last).Minutes() * float64(perMinute)
	if b.tokens > float64(perMinute) {
		b.tokens = float64(perMinute)
	}
	b.last = now
	t.sweep(now)
	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

// sweep drops buckets nobody has touched for idleTTL. Called under the lock, at most once a
// minute, so a busy limiter does not walk the map on every request.
func (t *Tiered) sweep(now time.Time) {
	if now.Sub(t.lastSweep) < time.Minute {
		return
	}
	t.lastSweep = now
	for key, b := range t.buckets {
		if now.Sub(b.last) > idleTTL {
			delete(t.buckets, key)
		}
	}
}

// Middleware keys unverified traffic by client IP at the base rate, and verified wallets
// (X-Wallet header or ?wallet=) by wallet at the verified rate. ponytail: buckets are never
// pruned; fine for a demo, add an eviction sweep for a long-running service.
func (t *Tiered) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		wallet := strings.ToLower(r.Header.Get("X-Wallet"))
		if wallet == "" {
			wallet = strings.ToLower(r.URL.Query().Get("wallet"))
		}
		key, rate := "ip:"+clientIP(r, t.TrustProxy), t.Base
		if wallet != "" && t.IsVerified != nil && t.IsVerified(wallet) {
			key, rate = "wallet:"+wallet, t.Verified
		}
		if !t.Allow(key, rate) {
			w.Header().Set("Retry-After", strconv.Itoa(60/max(rate, 1)+1))
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusTooManyRequests)
			_, _ = w.Write([]byte(`{"error":"rate limited","hint":"a Selfie Check-verified wallet gets a larger allowance"}`))
			return
		}
		next.ServeHTTP(w, r)
	})
}

func clientIP(r *http.Request, trustProxy bool) string {
	if xff := r.Header.Get("X-Forwarded-For"); trustProxy && xff != "" {
		return strings.TrimSpace(strings.Split(xff, ",")[0])
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
