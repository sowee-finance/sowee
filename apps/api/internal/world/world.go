// Package world verifies World ID Selfie Check proofs and treats them as an anti-sybil
// signal in front of full KYC. The proof never leaves the API; only "this wallet passed a
// Selfie Check" is recorded, keyed by the proof's nullifier so one person cannot verify twice.
package world

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/worldcoin/idkit/go/idkit"
)

// Config is read from WORLD_* env vars; the service is disabled unless all three ids are set.
type Config struct {
	AppID         string // app_… from the Developer Portal
	RPID          string // rp_… from the Developer Portal; also the verify path segment
	SigningKeyHex string // RP signing key (32-byte hex) from the Developer Portal
	Action        string // scopes the nullifier; default "sowee-selfie-check"
	Environment   string // "sandbox" or "production"
	VerifyBase    string // default https://developer.world.org/api/v4/verify
}

// Request is what the browser needs to open IDKit for a Selfie Check.
type Request struct {
	AppID       string            `json:"app_id"`
	RPID        string            `json:"rp_id"`
	Action      string            `json:"action"`
	Environment string            `json:"environment"`
	RPContext   idkit.RpSignature `json:"rp_context"`
}

var (
	ErrDisabled    = errors.New("world id is disabled: set WORLD_APP_ID, WORLD_RP_ID and WORLD_RP_SIGNING_KEY")
	ErrWrongAction = errors.New("proof was generated for another action")
	ErrReplay      = errors.New("this World ID already passed a Selfie Check here")
	ErrInvalid     = errors.New("proof rejected")
)

// Service signs requests and verifies results.
type Service struct {
	cfg    Config
	signer *idkit.Signer
	HTTP   *http.Client

	mu     sync.Mutex
	used   map[string]time.Time // nullifier -> first seen
	wallet map[string]string    // nullifier -> the wallet it was spent on
	human  map[string]string    // wallet -> the nullifier behind it
}

// New returns nil when the config is incomplete (feature off), an error when it is malformed.
func New(cfg Config) (*Service, error) {
	if cfg.AppID == "" || cfg.RPID == "" || cfg.SigningKeyHex == "" {
		return nil, nil
	}
	if cfg.Action == "" {
		cfg.Action = "sowee-selfie-check"
	}
	if cfg.Environment == "" {
		cfg.Environment = "sandbox"
	}
	if cfg.VerifyBase == "" {
		cfg.VerifyBase = "https://developer.world.org/api/v4/verify"
	}
	signer, err := idkit.NewSigner(cfg.SigningKeyHex)
	if err != nil {
		return nil, fmt.Errorf("WORLD_RP_SIGNING_KEY: %w", err)
	}
	return &Service{cfg: cfg, signer: signer, HTTP: &http.Client{Timeout: 20 * time.Second},
		used: map[string]time.Time{}, wallet: map[string]string{}, human: map[string]string{}}, nil
}

// Enabled is nil-safe.
func (s *Service) Enabled() bool { return s != nil }

// NewRequest produces a fresh RP signature (5-minute validity) bound to the action.
func (s *Service) NewRequest() (Request, error) {
	if s == nil {
		return Request{}, ErrDisabled
	}
	sig, err := s.signer.SignRequest(idkit.WithAction(s.cfg.Action))
	if err != nil {
		return Request{}, err
	}
	return Request{AppID: s.cfg.AppID, RPID: s.cfg.RPID, Action: s.cfg.Action, Environment: s.cfg.Environment, RPContext: sig}, nil
}

// result is the slice of the IDKit payload the service inspects; the rest is forwarded as-is.
// Selfie Check (Beta) still returns World ID 3.0 proofs, whose nullifier field is `nullifier_hash`.
type result struct {
	Action    string `json:"action"`
	Responses []struct {
		Nullifier     string `json:"nullifier"`
		NullifierHash string `json:"nullifier_hash"`
	} `json:"responses"`
}

// NullifierOf reads the nullifier out of an IDKit result without verifying anything. It exists
// so a rejected replay can name the wallet the proof already belongs to.
func NullifierOf(payload json.RawMessage) string {
	var r result
	if json.Unmarshal(payload, &r) != nil {
		return ""
	}
	return r.nullifier()
}

func (r result) nullifier() string {
	if len(r.Responses) == 0 {
		return ""
	}
	if r.Responses[0].Nullifier != "" {
		return r.Responses[0].Nullifier
	}
	return r.Responses[0].NullifierHash
}

// bind records which wallet a nullifier was spent on. Callers hold the mutex. The first binding
// wins: the topic is replayed oldest-first, so a restart reaches the same answer it had before.
func (s *Service) bind(nullifier, wallet string) {
	w := strings.ToLower(strings.TrimSpace(wallet))
	if nullifier == "" || w == "" {
		return
	}
	if _, ok := s.wallet[nullifier]; !ok {
		s.wallet[nullifier] = w
	}
	if _, ok := s.human[w]; !ok {
		s.human[w] = nullifier
	}
}

// WalletFor returns the wallet a nullifier was spent on, or "" if it is unspent or unknown.
func (s *Service) WalletFor(nullifier string) string {
	if s == nil {
		return ""
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.wallet[nullifier]
}

// HumanFor returns the nullifier behind a wallet, or "" when that wallet never passed a check.
// It is a pseudonym for one person, not an identity: two wallets sharing it are the same human,
// and nothing else can be read from it.
func (s *Service) HumanFor(wallet string) string {
	if s == nil {
		return ""
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.human[strings.ToLower(strings.TrimSpace(wallet))]
}

// Pass is one replayed Selfie Check: which World ID, and the wallet it was spent on.
type Pass struct{ Nullifier, Wallet string }

// Restore marks nullifiers as already used and rebuilds their wallet bindings. The service keeps
// both in memory, so without this a restart would let the same World ID pass a second time and
// the one-person rule would only hold for as long as the process did. Pass them oldest first,
// the order the topic returns: the first binding for a World ID is the one that stands.
func (s *Service) Restore(passes []Pass) int {
	if s == nil {
		return 0
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	n := 0
	for _, p := range passes {
		if p.Nullifier == "" {
			continue
		}
		if _, seen := s.used[p.Nullifier]; !seen {
			s.used[p.Nullifier] = time.Time{}
			n++
		}
		s.bind(p.Nullifier, p.Wallet)
	}
	return n
}

// Verify forwards the IDKit result to the Developer Portal and enforces one-proof-per-person,
// binding the nullifier to the wallet it was spent on. It returns the nullifier on success.
func (s *Service) Verify(ctx context.Context, wallet string, payload json.RawMessage) (string, error) {
	if s == nil {
		return "", ErrDisabled
	}
	var r result
	if err := json.Unmarshal(payload, &r); err != nil || r.nullifier() == "" {
		return "", fmt.Errorf("%w: malformed IDKit result", ErrInvalid)
	}
	if r.Action != s.cfg.Action {
		return "", ErrWrongAction
	}
	nullifier := r.nullifier()
	s.mu.Lock()
	_, seen := s.used[nullifier]
	s.mu.Unlock()
	if seen {
		return "", ErrReplay
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.cfg.VerifyBase+"/"+s.cfg.RPID, bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.HTTP.Do(req)
	if err != nil {
		return "", fmt.Errorf("world verify: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<16))
	if resp.StatusCode/100 != 2 {
		var e struct {
			Code   string `json:"code"`
			Detail string `json:"detail"`
		}
		_ = json.Unmarshal(body, &e)
		if e.Detail == "" {
			e.Detail = fmt.Sprintf("HTTP %d", resp.StatusCode)
		}
		return "", fmt.Errorf("%w: %s", ErrInvalid, e.Detail)
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if _, seen := s.used[nullifier]; seen { // lost a race with an identical request
		return "", ErrReplay
	}
	s.used[nullifier] = time.Now()
	s.bind(nullifier, wallet)
	// This map is the live copy; the durable one is the audit topic. Each pass is anchored as
	// selfie.v1 and replayed through Restore at startup, so a restart cannot hand the same World
	// ID a second wallet — which is the whole of the anti-sybil guarantee.
	return nullifier, nil
}
