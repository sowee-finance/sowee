package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"

	"github.com/sowee-finance/sowee/apps/api/internal/config"
	"github.com/sowee-finance/sowee/apps/api/internal/hcs"
	"github.com/sowee-finance/sowee/apps/api/internal/quote"
)

const (
	testKey    = "0x00000000000000000000000000000000000000000000000000000000000a11ce"
	testOracle = "0x1111111111111111111111111111111111111111"
)

func newTestServer(t *testing.T) (http.Handler, *quote.Signer) {
	t.Helper()
	return newTestServerWith(t, hcs.New("", nil))
}

func newTestServerWith(t *testing.T, anchor *hcs.Anchor) (http.Handler, *quote.Signer) {
	t.Helper()
	signer, err := quote.NewSigner(testKey, 296, testOracle)
	if err != nil {
		t.Fatal(err)
	}
	return New(config.Config{ChainID: 296, DiscountOracle: testOracle}, signer, anchor), signer
}

type memSubmitter struct{ n uint64 }

func (m *memSubmitter) Submit(context.Context, []byte) (uint64, error) {
	m.n++
	return m.n, nil
}

func do(h http.Handler, method, path, body string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(method, path, strings.NewReader(body)))
	return rec
}

func TestHealthz(t *testing.T) {
	h, signer := newTestServer(t)
	rec := do(h, http.MethodGet, "/v1/healthz", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
	var got struct {
		Status  string `json:"status"`
		ChainID int64  `json:"chainId"`
		Signer  string `json:"signer"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.Status != "ok" || got.ChainID != 296 || got.Signer != signer.Address().Hex() {
		t.Fatalf("unexpected body %s", rec.Body)
	}
	if rec.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Fatal("missing CORS header")
	}
}

func TestQuoteSignsAndRecovers(t *testing.T) {
	h, signer := newTestServer(t)
	rec := do(h, http.MethodPost, "/v1/invoices/INV-1/quote",
		`{"faceValue":"10000000000","maturity":4102444800}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
	var got struct {
		Quote struct {
			InvoiceID       common.Hash `json:"invoiceId"`
			FaceValue       string      `json:"faceValue"`
			DiscountRateBps uint16      `json:"discountRateBps"`
			ValidUntil      uint64      `json:"validUntil"`
			Nonce           uint64      `json:"nonce"`
		} `json:"quote"`
		Signature string      `json:"signature"`
		Digest    common.Hash `json:"digest"`
		Signer    string      `json:"signer"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.Quote.InvoiceID != crypto.Keccak256Hash([]byte("INV-1")) {
		t.Fatalf("invoiceId %s is not keccak256(\"INV-1\")", got.Quote.InvoiceID)
	}
	if got.Quote.FaceValue != "10000000000" || got.Quote.DiscountRateBps != 2000 {
		t.Fatalf("unexpected quote %+v", got.Quote)
	}
	if got.Signer != signer.Address().Hex() {
		t.Fatalf("signer %s", got.Signer)
	}
	sig := common.FromHex(got.Signature)
	if len(sig) != 65 {
		t.Fatalf("signature length %d", len(sig))
	}
	sig[64] -= 27
	pub, err := crypto.SigToPub(got.Digest[:], sig)
	if err != nil {
		t.Fatal(err)
	}
	if crypto.PubkeyToAddress(*pub) != signer.Address() {
		t.Fatal("signature does not recover to signer")
	}
}

func TestQuoteUsesHexInvoiceIDAsIs(t *testing.T) {
	h, _ := newTestServer(t)
	id := "0x" + strings.Repeat("ab", 32)
	rec := do(h, http.MethodPost, "/v1/invoices/"+id+"/quote",
		`{"faceValue":"1","maturity":4102444800}`)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"invoiceId":"`+id+`"`) {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
}

func TestQuoteRejectsBadInput(t *testing.T) {
	h, _ := newTestServer(t)
	for name, body := range map[string]string{
		"not json":        `{`,
		"zero face value": `{"faceValue":"0","maturity":4102444800}`,
		"float":           `{"faceValue":"1.5","maturity":4102444800}`,
		"past maturity":   `{"faceValue":"1","maturity":1}`,
	} {
		rec := do(h, http.MethodPost, "/v1/invoices/x/quote", body)
		if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), `"error"`) {
			t.Errorf("%s: status %d body %s", name, rec.Code, rec.Body)
		}
	}
}

const sha = "0x" + "ab" + "cd" + "ef" + "0123456789abcdef0123456789abcdef0123456789abcdef0123456789" // 32 bytes

func TestAttestAnchorsAndRejectsDoublePledge(t *testing.T) {
	h, _ := newTestServerWith(t, hcs.New("0.0.99", &memSubmitter{}))

	rec := do(h, http.MethodPost, "/v1/invoices/INV-1/attest", `{"docHash":"`+sha+`","event":"issued"}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("want 201, got %d: %s", rec.Code, rec.Body)
	}
	var res hcs.Result
	_ = json.Unmarshal(rec.Body.Bytes(), &res)
	if res.TopicID != "0.0.99" || res.SequenceNumber != 1 || !strings.Contains(res.Link, "0.0.99") {
		t.Fatalf("unexpected result %+v", res)
	}

	rec = do(h, http.MethodPost, "/v1/invoices/INV-2/attest", `{"docHash":"`+sha+`"}`)
	if rec.Code != http.StatusConflict || !strings.Contains(rec.Body.String(), `"invoiceId":"INV-1"`) {
		t.Fatalf("want 409 naming INV-1, got %d: %s", rec.Code, rec.Body)
	}

	rec = do(h, http.MethodPost, "/v1/invoices/INV-3/attest", `{"docHash":"0x1234"}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("want 400 for a short hash, got %d", rec.Code)
	}
}

func TestAttestDisabledIs503(t *testing.T) {
	h, _ := newTestServer(t)
	rec := do(h, http.MethodPost, "/v1/invoices/INV-1/attest", `{"docHash":"`+sha+`"}`)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("want 503, got %d: %s", rec.Code, rec.Body)
	}
}
