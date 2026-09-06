package kyc

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/ethereum/go-ethereum/common"
)

// State is the wallet's eligibility state as the UI sees it.
type State string

const (
	StateNone     State = "none"     // no applicant yet
	StatePending  State = "pending"  // review in progress
	StateHeld     State = "held"     // parked for compliance review
	StateBlocked  State = "blocked"  // excluded; never granted
	StateGranting State = "granting" // eligible; on-chain grants in flight
	StateGranted  State = "granted"  // eligible and granted on every live bond
)

// Status is what GET /v1/kyc/status returns. No personal data, only the decision.
type Status struct {
	Wallet      string   `json:"wallet"`
	State       State    `json:"state"`
	Reason      string   `json:"reason,omitempty"`
	ApplicantID string   `json:"applicantId,omitempty"`
	SelfieCheck bool     `json:"selfieCheck"`
	GrantTxs    []string `json:"grantTxs,omitempty"`
	UpdatedAt   string   `json:"updatedAt"`
}

// Grantor writes eligibility on-chain. Both calls are idempotent: bonds already in the target
// state are skipped.
type Grantor interface {
	Grant(ctx context.Context, wallet string) (txs []string, err error)
	Revoke(ctx context.Context, wallet string) (txs []string, err error)
}

// Flow orchestrates wallet → Sumsub → policy → on-chain grant.
type Flow struct {
	sumsub SumsubAPI
	grant  Grantor
	now    func() time.Time

	mu        sync.Mutex
	granted   map[string][]string  // wallet -> grant txs (this process)
	checkedAt map[string]time.Time // wallet -> last time bonds were re-checked
	inflight  map[string]bool      // wallet -> grant running
	selfie    map[string]bool      // wallet -> Selfie Check verified
	wg        sync.WaitGroup       // tests wait for background grants
}

// NewFlow wires the flow. A nil Grantor leaves eligible wallets in "granting".
func NewFlow(s SumsubAPI, g Grantor) *Flow {
	return &Flow{sumsub: s, grant: g, now: time.Now,
		granted: map[string][]string{}, checkedAt: map[string]time.Time{}, inflight: map[string]bool{}, selfie: map[string]bool{}}
}

// ErrDisabled is returned when Sumsub is not configured.
var ErrDisabled = errors.New("kyc is disabled: no sumsub credentials")

// ErrReviewed means the applicant already has a completed review; declarations are immutable
// from then on (a held PEP cannot simply resubmit "not a PEP").
var ErrReviewed = errors.New("verification already reviewed; contact compliance to change declarations")

// norm canonicalises a wallet so `0xAbC…`, `0xabc…` and `abc…` are one applicant.
func norm(wallet string) string {
	if common.IsHexAddress(wallet) {
		return strings.ToLower(common.HexToAddress(wallet).Hex())
	}
	return strings.ToLower(wallet)
}

// Session mints a WebSDK access token for the wallet.
func (f *Flow) Session(ctx context.Context, wallet string) (string, error) {
	if f.sumsub == nil {
		return "", ErrDisabled
	}
	return f.sumsub.AccessToken(ctx, norm(wallet), 10*time.Minute)
}

// SubmitProfile creates the applicant if needed and writes profile + questionnaire.
func (f *Flow) SubmitProfile(ctx context.Context, wallet string, info FixedInfo, answers Answers) error {
	if f.sumsub == nil {
		return ErrDisabled
	}
	w := norm(wallet)
	app, err := f.sumsub.Applicant(ctx, w)
	id := app.ID
	switch {
	case errors.Is(err, ErrNotFound):
		if id, err = f.sumsub.CreateApplicant(ctx, w); err != nil {
			return err
		}
	case err != nil:
		return err
	case app.Review.Answer != "" || strings.EqualFold(app.Review.Status, "completed"):
		return ErrReviewed
	}
	if err := f.sumsub.SetFixedInfo(ctx, id, info); err != nil {
		return err
	}
	return f.sumsub.SubmitQuestionnaire(ctx, id, answers)
}

// SetSelfieCheck records the anti-sybil signal for a wallet.
func (f *Flow) SetSelfieCheck(wallet string, ok bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.selfie[norm(wallet)] = ok
}

// SelfieCheck reports the signal.
func (f *Flow) SelfieCheck(wallet string) bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.selfie[norm(wallet)]
}

// Status re-reads Sumsub, runs the policy and drives the grant when eligible.
func (f *Flow) Status(ctx context.Context, wallet string) (Status, error) {
	w := norm(wallet)
	st := Status{Wallet: w, State: StateNone, SelfieCheck: f.SelfieCheck(w), UpdatedAt: f.now().UTC().Format(time.RFC3339)}
	if f.sumsub == nil {
		return st, ErrDisabled
	}
	app, err := f.sumsub.Applicant(ctx, w)
	if errors.Is(err, ErrNotFound) {
		return st, nil
	}
	if err != nil {
		return st, err
	}
	st.ApplicantID = app.ID
	v := Evaluate(app.Review, app.Answers)
	st.Reason = v.Reason
	switch v.Decision {
	case Pending:
		st.State = StatePending
	case Held:
		st.State = StateHeld
	case Blocked:
		st.State = StateBlocked
		f.ensureRevoked(w)
	case Eligible:
		st.State, st.GrantTxs = f.ensureGranted(w)
	}
	return st, nil
}

// RecheckEvery bounds how often a granted wallet is re-checked against the bond list, so a
// bond listed after the grant is picked up without turning every status read into RPC calls.
const RecheckEvery = time.Minute

// ensureGranted starts one background grant per wallet and reports the current state. A
// wallet already granted stays "granted" while a periodic re-check covers bonds listed later
// (the granter only sends transactions for bonds that lack the flag).
func (f *Flow) ensureGranted(w string) (State, []string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	txs, granted := f.granted[w]
	if f.grant == nil || f.inflight[w] {
		if granted {
			return StateGranted, txs
		}
		return StateGranting, nil
	}
	if granted && f.now().Sub(f.checkedAt[w]) < RecheckEvery {
		return StateGranted, txs
	}
	f.inflight[w] = true
	f.wg.Add(1)
	go func() {
		defer f.wg.Done()
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
		defer cancel()
		newTxs, err := f.grant.Grant(ctx, w)
		f.mu.Lock()
		defer f.mu.Unlock()
		delete(f.inflight, w)
		if err != nil {
			log.Printf("kyc: grant %s failed: %v", w, err)
			return
		}
		f.granted[w] = append(f.granted[w], newTxs...)
		f.checkedAt[w] = f.now()
		if len(newTxs) > 0 || !granted {
			log.Printf("kyc: granted %s on %d bond(s)", w, len(newTxs))
		}
	}()
	if granted {
		return StateGranted, txs
	}
	return StateGranting, nil
}

// ensureRevoked clears on-chain eligibility for a wallet this process granted earlier.
func (f *Flow) ensureRevoked(w string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if _, granted := f.granted[w]; !granted || f.grant == nil || f.inflight[w] {
		return
	}
	f.inflight[w] = true
	f.wg.Add(1)
	go func() {
		defer f.wg.Done()
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
		defer cancel()
		txs, err := f.grant.Revoke(ctx, w)
		f.mu.Lock()
		defer f.mu.Unlock()
		delete(f.inflight, w)
		if err != nil {
			log.Printf("kyc: revoke %s failed: %v", w, err)
			return
		}
		delete(f.granted, w)
		delete(f.checkedAt, w)
		log.Printf("kyc: revoked %s on %d bond(s)", w, len(txs))
	}()
}

// Wait blocks until background grants finish (tests).
func (f *Flow) Wait() { f.wg.Wait() }

// Webhook handles a Sumsub event; on applicantReviewed it re-evaluates the wallet.
func (f *Flow) Webhook(ctx context.Context, body []byte) (Status, bool, error) {
	var ev struct {
		Type           string `json:"type"`
		ExternalUserID string `json:"externalUserId"`
	}
	if err := json.Unmarshal(body, &ev); err != nil {
		return Status{}, false, err
	}
	if ev.Type != "applicantReviewed" || ev.ExternalUserID == "" {
		return Status{}, false, nil
	}
	st, err := f.Status(ctx, ev.ExternalUserID)
	return st, true, err
}
