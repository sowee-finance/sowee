package server

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"time"

	"github.com/sowee-finance/sowee/apps/api/internal/kyc"
)

// signedRequest is the wallet-authenticated envelope every KYC write carries.
type signedRequest struct {
	Wallet    string `json:"wallet"`
	IssuedAt  string `json:"issuedAt"`  // RFC3339, from GET /v1/kyc/challenge
	Signature string `json:"signature"` // personal_sign over kyc.ChallengeMessage
}

func (s signedRequest) verify(w http.ResponseWriter) bool {
	if err := kyc.VerifyChallenge(s.Wallet, s.IssuedAt, s.Signature, time.Now()); err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return false
	}
	return true
}

// kycChallenge returns the message a wallet must sign. GET /v1/kyc/challenge?wallet=0x…
func kycChallenge(w http.ResponseWriter, r *http.Request) {
	wallet := r.URL.Query().Get("wallet")
	now := time.Now().UTC().Truncate(time.Second)
	if err := kyc.VerifyChallenge(wallet, now.Format(time.RFC3339), "0x"+repeat("00", 65), now); errors.Is(err, kyc.ErrBadWallet) {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{
		"wallet":   wallet,
		"issuedAt": now.Format(time.RFC3339),
		"message":  kyc.ChallengeMessage(wallet, now),
	})
}

// kycSession mints a Sumsub WebSDK token for a wallet that proved key ownership.
func kycSession(f *kyc.Flow) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req signedRequest
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON body")
			return
		}
		if !req.verify(w) {
			return
		}
		token, err := f.Session(r.Context(), req.Wallet)
		if err != nil {
			writeKYCError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"token": token})
	}
}

type profileRequest struct {
	signedRequest
	Profile kyc.FixedInfo `json:"profile"`
	Answers kyc.Answers   `json:"answers"` // "section.item" -> value
}

// kycProfile writes the identity profile and the suitability declarations to Sumsub.
func kycProfile(f *kyc.Flow) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req profileRequest
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON body")
			return
		}
		if !req.verify(w) {
			return
		}
		if err := f.SubmitProfile(r.Context(), req.Wallet, req.Profile, req.Answers); err != nil {
			writeKYCError(w, err)
			return
		}
		st, err := f.Status(r.Context(), req.Wallet)
		if err != nil {
			writeKYCError(w, err)
			return
		}
		writeJSON(w, http.StatusAccepted, st)
	}
}

// kycStatus is public: it exposes the decision for a wallet, never personal data.
func kycStatus(f *kyc.Flow) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		wallet := r.URL.Query().Get("wallet")
		st, err := f.Status(r.Context(), wallet)
		if err != nil {
			writeKYCError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, st)
	}
}

// kycWebhook verifies Sumsub's digest over the raw body and re-evaluates the applicant.
func kycWebhook(f *kyc.Flow, secret string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 64<<10))
		if err != nil {
			writeError(w, http.StatusBadRequest, "unreadable body")
			return
		}
		if secret == "" || !kyc.VerifyWebhook(secret, r.Header.Get("x-payload-digest-alg"), r.Header.Get("x-payload-digest"), body) {
			writeError(w, http.StatusUnauthorized, "bad webhook digest")
			return
		}
		st, handled, err := f.Webhook(r.Context(), body)
		if err != nil && !errors.Is(err, kyc.ErrNotFound) {
			writeKYCError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"handled": handled, "state": st.State})
	}
}

func writeKYCError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, kyc.ErrDisabled):
		writeError(w, http.StatusServiceUnavailable, err.Error())
	case errors.Is(err, kyc.ErrNotFound):
		writeError(w, http.StatusNotFound, err.Error())
	default:
		writeError(w, http.StatusBadGateway, err.Error())
	}
}

func repeat(s string, n int) string {
	out := make([]byte, 0, len(s)*n)
	for i := 0; i < n; i++ {
		out = append(out, s...)
	}
	return string(out)
}
