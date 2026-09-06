// Package server wires the HTTP routes.
package server

import (
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/sowee-finance/sowee/apps/api/internal/config"
	"github.com/sowee-finance/sowee/apps/api/internal/faucet"
	"github.com/sowee-finance/sowee/apps/api/internal/hcs"
	"github.com/sowee-finance/sowee/apps/api/internal/kyc"
	"github.com/sowee-finance/sowee/apps/api/internal/market"
	"github.com/sowee-finance/sowee/apps/api/internal/quote"
	"github.com/sowee-finance/sowee/apps/api/internal/ratelimit"
	"github.com/sowee-finance/sowee/apps/api/internal/world"
	"github.com/sowee-finance/sowee/apps/api/internal/x402"
)

// Deps is everything the routes need.
type Deps struct {
	Signer *quote.Signer
	Anchor *hcs.Anchor
	Gate   *x402.Gate
	Market *market.Reader // nil until the market is deployed
	KYC    *kyc.Flow
	World  *world.Service // nil when Selfie Check is not configured
	Faucet *faucet.Faucet // nil when disabled
}

// New builds the router. Routes are versioned under /v1.
func New(cfg config.Config, d Deps) http.Handler {
	signer, anchor := d.Signer, d.Anchor
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	if cfg.TrustedProxy {
		r.Use(middleware.RealIP) // X-Forwarded-For is only meaningful behind our own proxy
	}
	r.Use(middleware.Logger, middleware.Recoverer, corsFor(cfg.WebOrigins))

	r.Get("/v1/healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"status":   "ok",
			"chainId":  cfg.ChainID,
			"signer":   signer.Address().Hex(),
			"hcs":      anchor.Enabled(),
			"hcsTopic": anchor.TopicID(),
		})
	})
	// Everything that costs the operator money or a vendor call sits behind the tiered limiter;
	// Selfie Check-verified wallets get the larger allowance.
	var verified func(string) bool
	if d.KYC != nil {
		verified = d.KYC.SelfieCheck
	}
	limiter := ratelimit.New(nz(cfg.RateBase, 30), nz(cfg.RateVerified, 300), verified, cfg.TrustedProxy)
	r.Group(func(r chi.Router) {
		r.Use(limiter.Middleware)
		r.Post("/v1/invoices/{id}/quote", quoteHandler(signer))
		r.Post("/v1/invoices/{id}/attest", attestHandler(anchor))
	})
	if d.KYC != nil {
		r.Group(func(r chi.Router) {
			r.Use(limiter.Middleware)
			r.Route("/v1/kyc", func(r chi.Router) {
				r.Get("/challenge", kycChallenge)
				r.Post("/session", kycSession(d.KYC))
				r.Post("/profile", kycProfile(d.KYC))
				r.Get("/status", kycStatus(d.KYC))
			})
			r.Get("/v1/world/request", worldRequest(d.World))
			r.Post("/v1/world/verify", worldVerify(d.World, d.KYC, anchor))
			r.Post("/v1/faucet", faucetHandler(d.Faucet, d.KYC))
		})
		r.Post("/v1/kyc/webhook", kycWebhook(d.KYC, cfg.SumsubWebhookSecret))
	}
	if d.Gate != nil {
		r.With(d.Gate.Middleware("Sowee market insights: every listed invoice bond with funded %, tenor and implied APR")).
			Get("/v1/market/insights", insightsHandler(cfg, d.Market))
		r.Get("/v1/market/insights/usage", func(w http.ResponseWriter, _ *http.Request) {
			writeJSON(w, http.StatusOK, map[string]any{"payers": d.Gate.UsageReport()})
		})
	}
	return r
}

// insightsHandler is the paid resource. It reads live market state; before the market is
// deployed it returns an empty list so the payment flow can still be exercised end-to-end.
func insightsHandler(cfg config.Config, reader *market.Reader) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		bonds, err := reader.Snapshot(r.Context())
		if err != nil {
			writeError(w, http.StatusBadGateway, "market read failed: "+err.Error())
			return
		}
		out := map[string]any{
			"asOf":    time.Now().UTC().Format(time.RFC3339),
			"chainId": cfg.ChainID,
			"market":  reader.Address(),
			"bonds":   bonds,
			"paidBy":  x402.PayerFrom(r.Context()),
		}
		if len(bonds) > 0 {
			out["best"] = bonds[0]
		} else {
			out["note"] = "no bonds listed yet"
		}
		writeJSON(w, http.StatusOK, out)
	}
}

// maxLogoBytes bounds what goes on the topic. The browser downscales to 64x64 before sending, so
// a real mark lands well inside this; anything larger is a file being pushed through a log.
const maxLogoBytes = 12 * 1024

// checkLogo accepts an empty logo, or a data URI holding a small raster image. It is rendered by
// every visitor's browser, so the type is pinned rather than trusted: an SVG would carry script.
func checkLogo(logo string) error {
	if logo == "" {
		return nil
	}
	if len(logo) > maxLogoBytes {
		return fmt.Errorf("logo must be at most %d bytes, got %d", maxLogoBytes, len(logo))
	}
	prefix, payload, ok := strings.Cut(logo, ",")
	if !ok || !slices.Contains(
		[]string{"data:image/webp;base64", "data:image/png;base64", "data:image/jpeg;base64"},
		prefix,
	) {
		return errors.New("logo must be a data URI holding a webp, png or jpeg image")
	}
	if _, err := base64.StdEncoding.DecodeString(payload); err != nil {
		return errors.New("logo is not valid base64")
	}
	return nil
}

type attestRequest struct {
	DocHash string `json:"docHash"` // sha256 of the invoice document, hex (0x optional)
	Event   string `json:"event"`   // lifecycle event name; defaults to "issued"
	Logo    string `json:"logo"`    // optional data: URI of a small image, downscaled by the browser
}

// attestHandler anchors {invoiceId, docHash, event} to the HCS topic. The same document may
// not be pledged under two invoices: that is a 409 carrying the invoice that owns the hash.
func attestHandler(anchor *hcs.Anchor) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req attestRequest
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON body")
			return
		}
		h := strings.TrimPrefix(strings.ToLower(strings.TrimSpace(req.DocHash)), "0x")
		if b, err := hex.DecodeString(h); err != nil || len(b) != 32 {
			writeError(w, http.StatusBadRequest, "docHash must be a 32-byte sha256 hex")
			return
		}
		if req.Event == "" {
			req.Event = "issued"
		}
		logo := strings.TrimSpace(req.Logo)
		if err := checkLogo(logo); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		res, err := anchor.Attest(r.Context(), chi.URLParam(r, "id"), h, req.Event, logo)
		switch {
		case errors.Is(err, hcs.ErrDisabled):
			writeError(w, http.StatusServiceUnavailable, err.Error())
		case errors.Is(err, hcs.ErrDuplicateDocHash):
			owner, _ := anchor.Known(h)
			writeJSON(w, http.StatusConflict, map[string]string{"error": err.Error(), "invoiceId": owner})
		case err != nil:
			writeError(w, http.StatusBadGateway, err.Error())
		default:
			writeJSON(w, http.StatusCreated, res)
		}
	}
}

// cors reflects an allowed origin rather than answering `*`. The x402 endpoint is paid and the
// KYC endpoints act on a signed wallet challenge, so there is no reason for an arbitrary page to
// be able to call them from a visitor's browser. `WEB_ORIGIN=*` opens it again when a demo needs
// to be reachable from somewhere else.
func corsFor(allowed []string) func(http.Handler) http.Handler {
	any := len(allowed) == 0
	for _, o := range allowed {
		if o == "*" {
			any = true
		}
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			h := w.Header()
			origin := r.Header.Get("Origin")
			switch {
			case any:
				h.Set("Access-Control-Allow-Origin", "*")
			case origin != "" && slices.Contains(allowed, origin):
				h.Set("Access-Control-Allow-Origin", origin)
				h.Set("Vary", "Origin")
			}
			h.Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			h.Set("Access-Control-Allow-Headers", "Content-Type, Authorization, "+x402.HeaderSignature)
			h.Set("Access-Control-Expose-Headers", x402.HeaderRequired+", "+x402.HeaderResponse)
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

type quoteRequest struct {
	Issuer    string `json:"issuer"`    // wallet that will list; bound into the signature
	FaceValue string `json:"faceValue"` // USDC base units (6 decimals), decimal string
	Maturity  int64  `json:"maturity"`  // unix seconds; bound into the signature
}

type quoteJSON struct {
	InvoiceID       common.Hash    `json:"invoiceId"`
	Issuer          common.Address `json:"issuer"`
	FaceValue       string         `json:"faceValue"`
	Maturity        uint64         `json:"maturity"`
	DiscountRateBps uint16         `json:"discountRateBps"`
	ValidUntil      uint64         `json:"validUntil"`
	Nonce           uint64         `json:"nonce"`
}

type quoteResponse struct {
	Quote     quoteJSON     `json:"quote"`
	Signature hexutil.Bytes `json:"signature"`
	Digest    common.Hash   `json:"digest"`
	Signer    string        `json:"signer"`
}

func quoteHandler(signer *quote.Signer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req quoteRequest
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON body")
			return
		}
		if !common.IsHexAddress(req.Issuer) {
			writeError(w, http.StatusBadRequest, "issuer must be the listing wallet's address")
			return
		}
		faceValue, ok := new(big.Int).SetString(req.FaceValue, 10)
		if !ok || faceValue.Sign() <= 0 || faceValue.BitLen() > 256 {
			writeError(w, http.StatusBadRequest, "faceValue must be a positive decimal string")
			return
		}
		now := time.Now()
		rate, err := quote.RateBps(now.Unix(), req.Maturity)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		q := quote.Quote{
			InvoiceID:       invoiceID(chi.URLParam(r, "id")),
			Issuer:          common.HexToAddress(req.Issuer),
			FaceValue:       faceValue,
			Maturity:        uint64(req.Maturity),
			DiscountRateBps: rate,
			ValidUntil:      uint64(now.Add(quote.Validity).Unix()),
			Nonce:           signer.NextNonce(now),
		}
		sig, digest, err := signer.Sign(q)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, quoteResponse{
			Quote: quoteJSON{
				InvoiceID:       q.InvoiceID,
				Issuer:          q.Issuer,
				FaceValue:       q.FaceValue.String(),
				Maturity:        q.Maturity,
				DiscountRateBps: q.DiscountRateBps,
				ValidUntil:      q.ValidUntil,
				Nonce:           q.Nonce,
			},
			Signature: sig,
			Digest:    digest,
			Signer:    signer.Address().Hex(),
		})
	}
}

// invoiceID accepts a 0x-prefixed 32-byte hex as-is; any other id is keccak256(id).
func invoiceID(id string) common.Hash {
	if b, err := hexutil.Decode(id); err == nil && len(b) == 32 {
		return common.BytesToHash(b)
	}
	return crypto.Keccak256Hash([]byte(id))
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func nz(v, def int) int {
	if v <= 0 {
		return def
	}
	return v
}
