package x402

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type fakeFac struct {
	valid   bool
	reason  string
	settle  bool
	verifyN int
	settleN int
	err     error
}

func (f *fakeFac) Supported(context.Context) (Supported, error) {
	return Supported{Kinds: []SupportedKind{{X402Version: 2, Scheme: "exact", Network: "hedera:testnet", Extra: map[string]any{"feePayer": "0.0.7162784"}}}}, nil
}
func (f *fakeFac) Verify(context.Context, PaymentPayload, PaymentRequirements) (VerifyResponse, error) {
	f.verifyN++
	return VerifyResponse{IsValid: f.valid, InvalidReason: f.reason, Payer: "0.0.10215221"}, f.err
}
func (f *fakeFac) Settle(context.Context, PaymentPayload, PaymentRequirements) (SettleResponse, error) {
	f.settleN++
	return SettleResponse{Success: f.settle, Transaction: "0.0.7162784@1.2", Network: "hedera:testnet", Payer: "0.0.10215221"}, f.err
}

var reqTemplate = PaymentRequirements{Network: "hedera:testnet", Amount: "10000", Asset: "0.0.429274", PayTo: "0.0.7162116"}

func newGate(fac *fakeFac) (*Gate, http.Handler, *[]string) {
	receipts := &[]string{}
	g := New(fac, reqTemplate, func(_ context.Context, s SettleResponse, _ PaymentRequirements, ep string) {
		*receipts = append(*receipts, ep+" "+s.Transaction)
	})
	h := g.Middleware("insights")(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("paid by " + PayerFrom(r.Context())))
	}))
	return g, h, receipts
}

func payment(t *testing.T, accepted PaymentRequirements, tx string) string {
	t.Helper()
	p := PaymentPayload{X402Version: 2, Accepted: accepted, Payload: json.RawMessage(`{"transaction":"` + tx + `"}`)}
	b, _ := json.Marshal(p)
	return base64.StdEncoding.EncodeToString(b)
}

func decodeRequired(t *testing.T, rec *httptest.ResponseRecorder) PaymentRequired {
	t.Helper()
	raw, err := base64.StdEncoding.DecodeString(rec.Header().Get(HeaderRequired))
	if err != nil {
		t.Fatalf("PAYMENT-REQUIRED header not base64: %v", err)
	}
	var pr PaymentRequired
	if err := json.Unmarshal(raw, &pr); err != nil {
		t.Fatal(err)
	}
	return pr
}

func TestUnpaidGets402WithRequirementsAndFeePayer(t *testing.T) {
	_, h, _ := newGate(&fakeFac{})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "http://api.local/v1/market/insights", nil))
	if rec.Code != http.StatusPaymentRequired {
		t.Fatalf("want 402, got %d", rec.Code)
	}
	pr := decodeRequired(t, rec)
	if pr.X402Version != 2 || len(pr.Accepts) != 1 || pr.Resource.URL != "http://api.local/v1/market/insights" {
		t.Fatalf("unexpected challenge %+v", pr)
	}
	a := pr.Accepts[0]
	if a.Scheme != "exact" || a.Network != "hedera:testnet" || a.Amount != "10000" || a.Asset != "0.0.429274" || a.PayTo != "0.0.7162116" || a.MaxTimeoutSeconds != 180 || a.Extra["feePayer"] != "0.0.7162784" {
		t.Fatalf("unexpected requirements %+v", a)
	}
	// body mirrors the header
	if !strings.Contains(rec.Body.String(), `"accepts"`) {
		t.Fatal("body should carry the challenge too")
	}
}

func TestMalformedPayloadIs400(t *testing.T) {
	_, h, _ := newGate(&fakeFac{})
	req := httptest.NewRequest(http.MethodGet, "/v1/market/insights", nil)
	req.Header.Set(HeaderSignature, "not base64!!")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", rec.Code)
	}
}

func TestMismatchedRequirementsIs402WithoutFacilitatorCall(t *testing.T) {
	fac := &fakeFac{valid: true, settle: true}
	_, h, _ := newGate(fac)
	wrong := reqTemplate
	wrong.Amount = "1"
	req := httptest.NewRequest(http.MethodGet, "/v1/market/insights", nil)
	req.Header.Set(HeaderSignature, payment(t, wrong, "AAAA"))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusPaymentRequired || fac.verifyN != 0 {
		t.Fatalf("want 402 and no verify, got %d verify=%d", rec.Code, fac.verifyN)
	}
}

func TestInvalidPaymentIs402(t *testing.T) {
	fac := &fakeFac{valid: false, reason: "invalid_exact_hedera_payload_signature_invalid"}
	_, h, _ := newGate(fac)
	accepted := reqTemplate
	accepted.Scheme = "exact"
	req := httptest.NewRequest(http.MethodGet, "/v1/market/insights", nil)
	req.Header.Set(HeaderSignature, payment(t, accepted, "AAAA"))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusPaymentRequired || fac.settleN != 0 {
		t.Fatalf("want 402 and no settle, got %d settle=%d", rec.Code, fac.settleN)
	}
	if pr := decodeRequired(t, rec); !strings.Contains(pr.Error, "signature_invalid") {
		t.Fatalf("error should carry the reason, got %q", pr.Error)
	}
}

func TestPaidRequestServesMetersAndAnchorsReceipt_thenReplayRejected(t *testing.T) {
	fac := &fakeFac{valid: true, settle: true}
	g, h, receipts := newGate(fac)
	accepted := reqTemplate
	accepted.Scheme = "exact"
	hdr := payment(t, accepted, "AAAA")

	req := httptest.NewRequest(http.MethodGet, "/v1/market/insights", nil)
	req.Header.Set(HeaderSignature, hdr)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || rec.Body.String() != "paid by 0.0.10215221" {
		t.Fatalf("want 200 with payer, got %d %q", rec.Code, rec.Body.String())
	}
	raw, _ := base64.StdEncoding.DecodeString(rec.Header().Get(HeaderResponse))
	var s SettleResponse
	if json.Unmarshal(raw, &s) != nil || !s.Success || s.Transaction != "0.0.7162784@1.2" {
		t.Fatalf("bad PAYMENT-RESPONSE: %s", raw)
	}
	if fac.verifyN != 1 || fac.settleN != 1 {
		t.Fatalf("verify=%d settle=%d", fac.verifyN, fac.settleN)
	}
	if len(*receipts) != 1 || (*receipts)[0] != "/v1/market/insights 0.0.7162784@1.2" {
		t.Fatalf("receipt hook not called: %v", *receipts)
	}
	u := g.UsageReport()
	if len(u) != 1 || u[0].Payer != "0.0.10215221" || u[0].Calls != 1 || u[0].Spent != "10000" {
		t.Fatalf("usage %+v", u)
	}

	// same payment header again → rejected before the facilitator
	req = httptest.NewRequest(http.MethodGet, "/v1/market/insights", nil)
	req.Header.Set(HeaderSignature, hdr)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusPaymentRequired || fac.verifyN != 1 {
		t.Fatalf("replay: want 402 and no new verify, got %d verify=%d", rec.Code, fac.verifyN)
	}
}

func TestFacilitatorDownIs502(t *testing.T) {
	fac := &fakeFac{err: errors.New("dial tcp: connection refused")}
	_, h, _ := newGate(fac)
	accepted := reqTemplate
	accepted.Scheme = "exact"
	req := httptest.NewRequest(http.MethodGet, "/v1/market/insights", nil)
	req.Header.Set(HeaderSignature, payment(t, accepted, "AAAA"))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("want 502, got %d", rec.Code)
	}
}

// A gateway that collected from the agent on its own rail cannot also satisfy a Hedera
// challenge. Given a key it is let through, metered under its own name, and — deliberately —
// leaves no settlement receipt, because nothing settled on chain.
func TestSettlementPartnerIsLetThroughAndMetered(t *testing.T) {
	settled := 0
	g := New(&fakeFac{}, PaymentRequirements{
		Network: "hedera:testnet", Asset: "0.0.429274", PayTo: "0.0.1", Amount: "10000",
	}, func(context.Context, SettleResponse, PaymentRequirements, string) { settled++ })
	g.PartnerKey, g.PartnerName = "s3cret", "bazantic"

	h := g.Middleware("insights")(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(PayerFrom(r.Context())))
	}))

	// Without the key, the resource is still paid.
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/v1/market/insights", nil))
	if rec.Code != http.StatusPaymentRequired {
		t.Fatalf("no key: want 402, got %d", rec.Code)
	}

	// A wrong key buys nothing.
	req := httptest.NewRequest(http.MethodGet, "/v1/market/insights", nil)
	req.Header.Set(HeaderPartner, "s3cres")
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusPaymentRequired {
		t.Fatalf("wrong key: want 402, got %d", rec.Code)
	}

	// The right key gets the data, and the handler sees who it was.
	req = httptest.NewRequest(http.MethodGet, "/v1/market/insights", nil)
	req.Header.Set(HeaderPartner, "s3cret")
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || rec.Body.String() != "bazantic" {
		t.Fatalf("with key: got %d %q", rec.Code, rec.Body.String())
	}
	if settled != 0 {
		t.Fatalf("a partner call must not produce a settlement receipt, got %d", settled)
	}
	report := g.UsageReport()
	if len(report) != 1 || report[0].Payer != "bazantic" || report[0].Calls != 1 {
		t.Fatalf("usage: %+v", report)
	}
}
