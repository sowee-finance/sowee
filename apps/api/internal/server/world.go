package server

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"github.com/sowee-finance/sowee/apps/api/internal/faucet"
	"github.com/sowee-finance/sowee/apps/api/internal/hcs"
	"github.com/sowee-finance/sowee/apps/api/internal/kyc"
	"github.com/sowee-finance/sowee/apps/api/internal/world"
)

// worldRequest hands the browser what IDKit needs: app id, action and a fresh RP signature.
func worldRequest(s *world.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		req, err := s.NewRequest()
		if errors.Is(err, world.ErrDisabled) {
			writeError(w, http.StatusServiceUnavailable, err.Error())
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, req)
	}
}

type worldVerifyRequest struct {
	signedRequest
	Result json.RawMessage `json:"result"` // the IDKit success payload, forwarded as-is
}

// worldVerify records the Selfie Check signal for a wallet that proved key ownership.
func worldVerify(s *world.Service, f *kyc.Flow, anchor *hcs.Anchor) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req worldVerifyRequest
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON body")
			return
		}
		if !req.verify(w) {
			return
		}
		nullifier, err := s.Verify(r.Context(), req.Result)
		switch {
		case errors.Is(err, world.ErrDisabled):
			writeError(w, http.StatusServiceUnavailable, err.Error())
			return
		case errors.Is(err, world.ErrReplay):
			writeError(w, http.StatusConflict, err.Error())
			return
		case errors.Is(err, world.ErrWrongAction), errors.Is(err, world.ErrInvalid):
			writeError(w, http.StatusBadRequest, err.Error())
			return
		case err != nil:
			writeError(w, http.StatusBadGateway, err.Error())
			return
		}
		f.SetSelfieCheck(req.Wallet, true)
		// Anchoring makes the signal outlive this process: the topic is replayed on start, which
		// restores both who is verified and which World IDs have already been used here.
		if _, err := anchor.Selfie(r.Context(), req.Wallet, nullifier); err != nil && !errors.Is(err, hcs.ErrDisabled) {
			log.Printf("world: selfie check for %s not anchored: %v", req.Wallet, err)
		}
		writeJSON(w, http.StatusOK, map[string]any{"selfieCheck": true, "nullifier": nullifier})
	}
}

// faucetHandler drips demo USDC, gated on the Selfie Check signal. It is *not* gated on KYC:
// the point is a cheap anti-abuse check in front of the expensive one.
func faucetHandler(fc *faucet.Faucet, f *kyc.Flow) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req signedRequest
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON body")
			return
		}
		if !req.verify(w) {
			return
		}
		if !f.SelfieCheck(req.Wallet) {
			writeError(w, http.StatusForbidden, "selfie check required before using the faucet")
			return
		}
		if !fc.Enabled() {
			writeError(w, http.StatusServiceUnavailable, "faucet is disabled")
			return
		}
		tx, err := fc.Drip(r.Context(), req.Wallet)
		switch {
		case errors.Is(err, faucet.ErrCooldown):
			writeError(w, http.StatusTooManyRequests, err.Error())
		case err != nil:
			writeError(w, http.StatusBadGateway, err.Error())
		default:
			writeJSON(w, http.StatusOK, map[string]any{"tx": tx, "amount": fc.Amount.String()})
		}
	}
}
