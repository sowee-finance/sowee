package x402

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"sort"
	"sync"
	"time"
)

// Settled is called after a successful settlement (used to anchor a receipt on HCS).
type Settled func(ctx context.Context, s SettleResponse, r PaymentRequirements, endpoint string)

// Usage is per-payer metering.
type Usage struct {
	Payer string `json:"payer"`
	Calls int    `json:"calls"`
	Spent string `json:"spent"` // sum of Amount in asset base units
	Last  string `json:"last"`  // RFC3339 of the last settled call
}

// Gate protects handlers with one PaymentRequirements template.
type Gate struct {
	Fac      FacilitatorAPI
	Req      PaymentRequirements // Extra.feePayer is filled from /supported when missing
	OnSettle Settled
	now      func() time.Time

	mu       sync.Mutex
	feePayer string
	seen     map[string]time.Time // sha256(payload) -> first seen; replay guard
	usage    map[string]*Usage
	spent    map[string]uint64
}

// New builds a gate. Amount is in the asset's base units.
func New(fac FacilitatorAPI, req PaymentRequirements, onSettle Settled) *Gate {
	if req.Scheme == "" {
		req.Scheme = "exact"
	}
	if req.MaxTimeoutSeconds == 0 {
		req.MaxTimeoutSeconds = 180
	}
	return &Gate{Fac: fac, Req: req, OnSettle: onSettle, now: time.Now,
		seen: map[string]time.Time{}, usage: map[string]*Usage{}, spent: map[string]uint64{}}
}

// Requirements returns the template with the facilitator's fee payer resolved.
func (g *Gate) Requirements(ctx context.Context) PaymentRequirements {
	r := g.Req
	if fp := g.resolveFeePayer(ctx); fp != "" {
		if r.Extra == nil {
			r.Extra = map[string]any{}
		}
		r.Extra["feePayer"] = fp
	}
	return r
}

func (g *Gate) resolveFeePayer(ctx context.Context) string {
	if fp, ok := g.Req.Extra["feePayer"].(string); ok && fp != "" {
		return fp
	}
	g.mu.Lock()
	cached := g.feePayer
	g.mu.Unlock()
	if cached != "" {
		return cached
	}
	sup, err := g.Fac.Supported(ctx)
	if err != nil {
		log.Printf("x402: /supported: %v", err)
		return ""
	}
	for _, k := range sup.Kinds {
		if k.Network == g.Req.Network && k.Scheme == g.Req.Scheme {
			if fp, ok := k.Extra["feePayer"].(string); ok {
				g.mu.Lock()
				g.feePayer = fp
				g.mu.Unlock()
				return fp
			}
		}
	}
	return ""
}

type ctxKey struct{}

// PayerFrom returns the settled payer of the current request, if any.
func PayerFrom(ctx context.Context) string {
	p, _ := ctx.Value(ctxKey{}).(string)
	return p
}

// Middleware enforces payment for the wrapped handler. description is shown in the challenge.
func (g *Gate) Middleware(description string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := r.Context()
			reqs := g.Requirements(ctx)
			resource := Resource{URL: absoluteURL(r), Description: description, MimeType: "application/json"}

			raw := r.Header.Get(HeaderSignature)
			if raw == "" {
				raw = r.Header.Get(legacyHeader)
			}
			if raw == "" {
				g.challenge(w, http.StatusPaymentRequired, resource, reqs, "")
				return
			}
			body, err := base64.StdEncoding.DecodeString(raw)
			var payload PaymentPayload
			if err != nil || json.Unmarshal(body, &payload) != nil {
				g.challenge(w, http.StatusBadRequest, resource, reqs, "malformed payment payload")
				return
			}
			if !matches(payload.Accepted, reqs) {
				g.challenge(w, http.StatusPaymentRequired, resource, reqs, "payment does not match the accepted requirements")
				return
			}
			sum := sha256.Sum256(body)
			key := hex.EncodeToString(sum[:])
			// Reserve the payload before talking to the facilitator so two identical concurrent
			// requests cannot both reach /settle; the reservation is released if payment fails.
			if !g.reserve(key) {
				g.challenge(w, http.StatusPaymentRequired, resource, reqs, "payment already used")
				return
			}
			v, err := g.Fac.Verify(ctx, payload, reqs)
			if err != nil {
				g.release(key)
				g.challenge(w, http.StatusBadGateway, resource, reqs, "facilitator verify failed: "+err.Error())
				return
			}
			if !v.IsValid {
				g.release(key)
				g.challenge(w, http.StatusPaymentRequired, resource, reqs, "invalid payment: "+v.InvalidReason)
				return
			}
			s, err := g.Fac.Settle(ctx, payload, reqs)
			if err != nil {
				g.release(key)
				g.challenge(w, http.StatusBadGateway, resource, reqs, "facilitator settle failed: "+err.Error())
				return
			}
			if !s.Success {
				g.release(key)
				g.challenge(w, http.StatusPaymentRequired, resource, reqs, "settlement failed: "+s.ErrorReason)
				return
			}
			payer := s.Payer
			if payer == "" {
				payer = v.Payer
			}
			g.record(key, payer, reqs.Amount)
			if g.OnSettle != nil {
				g.OnSettle(ctx, s, reqs, r.URL.Path)
			}
			enc, _ := json.Marshal(s)
			w.Header().Set(HeaderResponse, base64.StdEncoding.EncodeToString(enc))
			next.ServeHTTP(w, r.WithContext(context.WithValue(ctx, ctxKey{}, payer)))
		})
	}
}

// ponytail: verify → settle → serve. A handler failure after settlement is not refunded;
// buffer the response and settle last if that ever matters.

func (g *Gate) challenge(w http.ResponseWriter, status int, res Resource, reqs PaymentRequirements, errMsg string) {
	pr := PaymentRequired{X402Version: Version, Error: errMsg, Resource: res, Accepts: []PaymentRequirements{reqs}}
	enc, _ := json.Marshal(pr)
	w.Header().Set(HeaderRequired, base64.StdEncoding.EncodeToString(enc))
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(pr) // body mirrors the header for humans and curl
}

func matches(a, b PaymentRequirements) bool {
	return a.Scheme == b.Scheme && a.Network == b.Network && a.Asset == b.Asset && a.PayTo == b.PayTo && a.Amount == b.Amount
}

// reserve marks a payload as in use; false when it was already seen.
func (g *Gate) reserve(key string) bool {
	g.mu.Lock()
	defer g.mu.Unlock()
	if _, seen := g.seen[key]; seen {
		return false
	}
	g.seen[key] = g.now()
	return true
}

func (g *Gate) release(key string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	delete(g.seen, key)
}

func (g *Gate) record(key, payer, amount string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	now := g.now()
	g.seen[key] = now
	// ponytail: unbounded in-memory replay set; prune by age if this runs for weeks.
	u := g.usage[payer]
	if u == nil {
		u = &Usage{Payer: payer}
		g.usage[payer] = u
	}
	u.Calls++
	var amt uint64
	for _, c := range amount {
		if c < '0' || c > '9' {
			amt = 0
			break
		}
		amt = amt*10 + uint64(c-'0')
	}
	g.spent[payer] += amt
	u.Spent = formatUint(g.spent[payer])
	u.Last = now.UTC().Format(time.RFC3339)
}

// UsageReport lists payers by calls, most active first.
func (g *Gate) UsageReport() []Usage {
	g.mu.Lock()
	defer g.mu.Unlock()
	out := make([]Usage, 0, len(g.usage))
	for _, u := range g.usage {
		out = append(out, *u)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Calls > out[j].Calls })
	return out
}

func formatUint(n uint64) string {
	if n == 0 {
		return "0"
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	return string(b[i:])
}

func absoluteURL(r *http.Request) string {
	scheme := "http"
	if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
		scheme = "https"
	}
	return scheme + "://" + r.Host + r.URL.Path
}
