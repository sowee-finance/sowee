// Package hcs anchors Sowee's audit trail to a Hedera Consensus Service topic.
//
// Two message kinds are written: invoice attestations (lifecycle event + document sha256) and
// x402 payment receipts. The topic is public, so anyone can replay the trail from the mirror
// node; that is also how this package rebuilds its duplicate-document index after a restart.
package hcs

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"
)

// Submitter writes one message to the topic and returns its sequence number.
type Submitter interface {
	Submit(ctx context.Context, message []byte) (uint64, error)
}

// Attestation is written on every lifecycle event of an invoice.
type Attestation struct {
	Type      string `json:"type"` // "attestation.v1"
	InvoiceID string `json:"invoiceId"`
	DocHash   string `json:"docHash"` // sha256 of the invoice document, hex, hashed client-side
	Event     string `json:"event"`   // issued | funded | traded | settled | ...
	// Logo is the issuer's own mark: a small image the browser downscaled, carried as a data URI
	// so it lives with the record rather than behind a link that can rot. Like every other field
	// here it is public and permanent.
	Logo      string `json:"logo,omitempty"`
	Timestamp string `json:"timestamp"`
}

// Receipt is written after every settled x402 payment.
type Receipt struct {
	Type         string `json:"type"` // "x402.receipt.v1"
	Endpoint     string `json:"endpoint"`
	Payer        string `json:"payer"`
	Amount       string `json:"amount"`
	Asset        string `json:"asset"`
	SettlementTx string `json:"settlementTx"`
	Timestamp    string `json:"timestamp"`
}

// SelfieCheck records that a wallet passed a World Selfie Check. The nullifier is the World ID's
// pseudonym for this action, so replaying the topic restores both facts the signal depends on:
// which wallets are verified, and which World IDs have already been used here.
type SelfieCheck struct {
	Type      string `json:"type"` // "selfie.v1"
	Wallet    string `json:"wallet"`
	Nullifier string `json:"nullifier"`
	Timestamp string `json:"timestamp"`
}

// Result points at the anchored message.
type Result struct {
	TopicID        string `json:"topicId"`
	SequenceNumber uint64 `json:"sequenceNumber"`
	Link           string `json:"link"`
}

// ErrDuplicateDocHash means the document is already pledged under another invoice.
var ErrDuplicateDocHash = errors.New("document hash already attested for another invoice")

// ErrDisabled is returned when no operator credentials were configured.
var ErrDisabled = errors.New("hcs anchoring is disabled: no operator configured")

// Anchor serialises writes to one topic and guards against double pledging.
type Anchor struct {
	topicID string
	sub     Submitter
	now     func() time.Time

	mu        sync.Mutex
	docHashes map[string]string // docHash -> invoiceId
	selfies   []SelfieCheck     // replayed Selfie Check records, oldest first
}

// New returns an Anchor for topicID. A nil Submitter yields a disabled anchor.
func New(topicID string, sub Submitter) *Anchor {
	return &Anchor{topicID: topicID, sub: sub, now: time.Now, docHashes: map[string]string{}}
}

// Enabled reports whether messages can be written.
func (a *Anchor) Enabled() bool { return a != nil && a.sub != nil }

// TopicID is the anchored topic, empty when disabled.
func (a *Anchor) TopicID() string {
	if a == nil {
		return ""
	}
	return a.topicID
}

// Attest anchors a lifecycle event. The first attestation of a docHash binds it to invoiceID;
// a later attestation of the same hash under a different invoice is rejected.
func (a *Anchor) Attest(ctx context.Context, invoiceID, docHash, event, logo string) (Result, error) {
	if !a.Enabled() {
		return Result{}, ErrDisabled
	}
	docHash = normalizeHash(docHash)
	a.mu.Lock()
	defer a.mu.Unlock()
	// An attestation without a document — a logo, say — pledges nothing, so it binds nothing.
	if docHash != "" {
		if owner, seen := a.docHashes[docHash]; seen && owner != invoiceID {
			return Result{}, ErrDuplicateDocHash
		}
	}
	res, err := a.write(ctx, Attestation{
		Type:      "attestation.v1",
		InvoiceID: invoiceID,
		DocHash:   docHash,
		Event:     event,
		Logo:      logo,
		Timestamp: a.now().UTC().Format(time.RFC3339),
	})
	if err != nil {
		return Result{}, err
	}
	if docHash != "" {
		a.docHashes[docHash] = invoiceID
	}
	return res, nil
}

// Receipt anchors an x402 settlement.
func (a *Anchor) Receipt(ctx context.Context, r Receipt) (Result, error) {
	if !a.Enabled() {
		return Result{}, ErrDisabled
	}
	r.Type = "x402.receipt.v1"
	if r.Timestamp == "" {
		r.Timestamp = a.now().UTC().Format(time.RFC3339)
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.write(ctx, r)
}

// Selfie anchors a passed Selfie Check so the signal and the used nullifier survive a restart.
func (a *Anchor) Selfie(ctx context.Context, wallet, nullifier string) (Result, error) {
	if !a.Enabled() {
		return Result{}, ErrDisabled
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.write(ctx, SelfieCheck{
		Type:      "selfie.v1",
		Wallet:    strings.ToLower(wallet),
		Nullifier: nullifier,
		Timestamp: a.now().UTC().Format(time.RFC3339),
	})
}

// Load replays raw topic messages (as returned by the mirror node) to rebuild the docHash index
// and collect the Selfie Check records. Unknown or malformed messages are skipped. Returns how
// many attestations were indexed.
func (a *Anchor) Load(messages [][]byte) int {
	a.mu.Lock()
	defer a.mu.Unlock()
	n := 0
	for _, m := range messages {
		var kind struct {
			Type string `json:"type"`
		}
		if json.Unmarshal(m, &kind) != nil {
			continue
		}
		switch kind.Type {
		case "attestation.v1":
			var att Attestation
			if json.Unmarshal(m, &att) != nil || att.DocHash == "" {
				continue
			}
			if _, seen := a.docHashes[normalizeHash(att.DocHash)]; !seen {
				a.docHashes[normalizeHash(att.DocHash)] = att.InvoiceID
				n++
			}
		case "selfie.v1":
			var sc SelfieCheck
			if json.Unmarshal(m, &sc) != nil || sc.Wallet == "" || sc.Nullifier == "" {
				continue
			}
			a.selfies = append(a.selfies, sc)
		}
	}
	return n
}

// Selfies returns the Selfie Check records replayed from the topic, oldest first.
func (a *Anchor) Selfies() []SelfieCheck {
	if a == nil {
		return nil
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	return append([]SelfieCheck(nil), a.selfies...)
}

// Known reports which invoice a docHash is bound to, if any.
func (a *Anchor) Known(docHash string) (string, bool) {
	a.mu.Lock()
	defer a.mu.Unlock()
	id, ok := a.docHashes[normalizeHash(docHash)]
	return id, ok
}

func (a *Anchor) write(ctx context.Context, v any) (Result, error) {
	body, err := json.Marshal(v)
	if err != nil {
		return Result{}, err
	}
	seq, err := a.sub.Submit(ctx, body)
	if err != nil {
		return Result{}, fmt.Errorf("hcs submit: %w", err)
	}
	return Result{TopicID: a.topicID, SequenceNumber: seq, Link: TopicLink(a.topicID)}, nil
}

// TopicLink is the HashScan page of a testnet topic.
func TopicLink(topicID string) string {
	return "https://hashscan.io/testnet/topic/" + topicID
}

func normalizeHash(h string) string {
	return strings.ToLower(strings.TrimPrefix(strings.TrimSpace(h), "0x"))
}
