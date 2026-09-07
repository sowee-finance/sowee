package hcs

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"
)

type fakeSub struct {
	msgs [][]byte
	fail error
}

func (f *fakeSub) Submit(_ context.Context, m []byte) (uint64, error) {
	if f.fail != nil {
		return 0, f.fail
	}
	f.msgs = append(f.msgs, m)
	return uint64(len(f.msgs)), nil
}

func newAnchor(t *testing.T) (*Anchor, *fakeSub) {
	t.Helper()
	sub := &fakeSub{}
	a := New("0.0.4242", sub)
	a.now = func() time.Time { return time.Date(2026, 9, 6, 12, 0, 0, 0, time.UTC) }
	return a, sub
}

func TestAttestWritesJSONAndBindsDocHash(t *testing.T) {
	a, sub := newAnchor(t)
	res, err := a.Attest(context.Background(), "INV-1", "0xABCDEF", "issued", "")
	if err != nil {
		t.Fatal(err)
	}
	if res.SequenceNumber != 1 || res.TopicID != "0.0.4242" || res.Link != "https://hashscan.io/testnet/topic/0.0.4242" {
		t.Fatalf("unexpected result %+v", res)
	}
	var att Attestation
	if err := json.Unmarshal(sub.msgs[0], &att); err != nil {
		t.Fatal(err)
	}
	if att.Type != "attestation.v1" || att.DocHash != "abcdef" || att.Event != "issued" || att.Timestamp != "2026-09-06T12:00:00Z" {
		t.Fatalf("unexpected message %+v", att)
	}
	if id, ok := a.Known("ABCDEF"); !ok || id != "INV-1" {
		t.Fatalf("docHash not bound: %q %v", id, ok)
	}
}

func TestAttestRejectsSameDocHashForAnotherInvoice(t *testing.T) {
	a, sub := newAnchor(t)
	if _, err := a.Attest(context.Background(), "INV-1", "aa", "issued", ""); err != nil {
		t.Fatal(err)
	}
	// same invoice, later event: fine
	if _, err := a.Attest(context.Background(), "INV-1", "aa", "funded", ""); err != nil {
		t.Fatal(err)
	}
	// another invoice pledging the same document: rejected, nothing written
	_, err := a.Attest(context.Background(), "INV-2", "0xAA", "issued", "")
	if !errors.Is(err, ErrDuplicateDocHash) {
		t.Fatalf("want ErrDuplicateDocHash, got %v", err)
	}
	if len(sub.msgs) != 2 {
		t.Fatalf("duplicate must not be written, got %d messages", len(sub.msgs))
	}
}

func TestSubmitFailureDoesNotBind(t *testing.T) {
	a, sub := newAnchor(t)
	sub.fail = errors.New("network down")
	if _, err := a.Attest(context.Background(), "INV-1", "aa", "issued", ""); err == nil {
		t.Fatal("expected error")
	}
	if _, ok := a.Known("aa"); ok {
		t.Fatal("failed submit must not bind the hash")
	}
}

func TestLoadRebuildsIndexFromRawMessages(t *testing.T) {
	a, _ := newAnchor(t)
	raw := [][]byte{
		[]byte(`{"type":"attestation.v1","invoiceId":"INV-9","docHash":"0xBEEF","event":"issued","timestamp":"x"}`),
		[]byte(`{"type":"x402.receipt.v1","endpoint":"/v1/market/insights"}`),
		[]byte(`not json`),
	}
	if n := a.Load(raw); n != 1 {
		t.Fatalf("want 1 loaded, got %d", n)
	}
	if _, err := a.Attest(context.Background(), "INV-1", "beef", "issued", ""); !errors.Is(err, ErrDuplicateDocHash) {
		t.Fatalf("index not rebuilt: %v", err)
	}
}

func TestReceiptAndDisabled(t *testing.T) {
	a, sub := newAnchor(t)
	res, err := a.Receipt(context.Background(), Receipt{Endpoint: "/v1/market/insights", Payer: "0.0.1", Amount: "10000", Asset: "0.0.429274", SettlementTx: "0.0.2@1.2"})
	if err != nil || res.SequenceNumber != 1 {
		t.Fatalf("receipt: %v %+v", err, res)
	}
	var r Receipt
	_ = json.Unmarshal(sub.msgs[0], &r)
	if r.Type != "x402.receipt.v1" || r.Timestamp == "" {
		t.Fatalf("unexpected receipt %+v", r)
	}

	off := New("", nil)
	if _, err := off.Attest(context.Background(), "x", "y", "z", ""); !errors.Is(err, ErrDisabled) {
		t.Fatalf("want ErrDisabled, got %v", err)
	}
	if off.Enabled() {
		t.Fatal("nil submitter must be disabled")
	}
}

func TestSelfieChecksSurviveAReplay(t *testing.T) {
	a, sub := newAnchor(t)
	if _, err := a.Selfie(context.Background(), "0xAbC", "0xnullifier-1"); err != nil {
		t.Fatal(err)
	}
	var written SelfieCheck
	if err := json.Unmarshal(sub.msgs[0], &written); err != nil {
		t.Fatal(err)
	}
	if written.Type != "selfie.v1" || written.Wallet != "0xabc" || written.Nullifier != "0xnullifier-1" {
		t.Fatalf("unexpected record %+v", written)
	}

	// A fresh process reading the topic gets both facts back, and ignores the other message kinds.
	fresh := New("0.0.4242", &fakeSub{})
	fresh.Load([][]byte{
		sub.msgs[0],
		[]byte(`{"type":"attestation.v1","invoiceId":"INV-1","docHash":"aa","event":"issued"}`),
		[]byte(`{"type":"selfie.v1","wallet":"0xdef","nullifier":""}`),
	})
	got := fresh.Selfies()
	if len(got) != 1 || got[0].Wallet != "0xabc" || got[0].Nullifier != "0xnullifier-1" {
		t.Fatalf("replay: %+v", got)
	}
}

// An attestation with no document pledges nothing, so two of them under different invoices must
// not collide on the empty hash.
func TestAttestWithoutADocumentBindsNothing(t *testing.T) {
	a, _ := newAnchor(t)
	if _, err := a.Attest(context.Background(), "INV-1", "", "logo", "data:image/webp;base64,x"); err != nil {
		t.Fatal(err)
	}
	if _, err := a.Attest(context.Background(), "INV-2", "", "logo", "data:image/webp;base64,y"); err != nil {
		t.Fatalf("a second logo-only attestation should not collide: %v", err)
	}
	if owner, ok := a.Known(""); ok {
		t.Fatalf("the empty hash was bound to %q", owner)
	}
}
