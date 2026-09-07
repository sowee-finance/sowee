package server

import (
	"context"
	"encoding/json"
	"fmt"
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
	return New(config.Config{ChainID: 296, DiscountOracle: testOracle}, Deps{Signer: signer, Anchor: anchor}), signer
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
		`{"issuer":"0x2222222222222222222222222222222222222222","faceValue":"10000000000","maturity":4102444800}`)
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
		`{"issuer":"0x2222222222222222222222222222222222222222","faceValue":"1","maturity":4102444800}`)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"invoiceId":"`+id+`"`) {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
}

func TestQuoteRejectsBadInput(t *testing.T) {
	h, _ := newTestServer(t)
	for name, body := range map[string]string{
		"not json":        `{`,
		"zero face value": `{"issuer":"0x2222222222222222222222222222222222222222","faceValue":"0","maturity":4102444800}`,
		"float":           `{"issuer":"0x2222222222222222222222222222222222222222","faceValue":"1.5","maturity":4102444800}`,
		"past maturity":   `{"issuer":"0x2222222222222222222222222222222222222222","faceValue":"1","maturity":1}`,
		"no issuer":       `{"faceValue":"1","maturity":4102444800}`,
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

// A logo the size a browser really sends must reach the handler. The body limit and the logo
// limit were set apart from each other once, and everything larger than 1 KB — which is every
// real mark — came back as "invalid JSON body".
func TestAttestAcceptsALogoOfTheSizeABrowserSends(t *testing.T) {
	h, _ := newTestServerWith(t, hcs.New("0.0.1", nil))
	logo := "data:image/webp;base64," + strings.Repeat("A", 8*1024)
	body := fmt.Sprintf(
		`{"docHash":"0x9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08","logo":%q}`,
		logo,
	)
	rec := do(h, http.MethodPost, "/v1/invoices/INV-1/attest", body)
	// 503 is the disabled anchor: the body was read and the logo passed its checks.
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("an %d-byte logo: want 503 from the disabled anchor, got %d %s", len(logo), rec.Code, rec.Body)
	}
}

// A mark is not a document: a bond listed before the logo existed has no document attestation to
// re-anchor, and inventing a hash for it would put a claim on the trail that no file backs.
func TestAttestTakesALogoWithoutADocument(t *testing.T) {
	h, _ := newTestServerWith(t, hcs.New("0.0.1", nil))

	// 503 is the disabled anchor: the request was accepted and reached it.
	rec := do(h, http.MethodPost, "/v1/invoices/INV-1/attest",
		`{"logo":"data:image/webp;base64,UklGRg=="}`)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("logo without a docHash: want 503, got %d %s", rec.Code, rec.Body)
	}
	// Neither is nothing to anchor.
	if rec := do(h, http.MethodPost, "/v1/invoices/INV-1/attest", `{}`); rec.Code != http.StatusBadRequest {
		t.Fatalf("empty attestation: want 400, got %d %s", rec.Code, rec.Body)
	}
	// A malformed hash is still a malformed hash.
	if rec := do(h, http.MethodPost, "/v1/invoices/INV-1/attest", `{"docHash":"0xnope"}`); rec.Code != http.StatusBadRequest {
		t.Fatalf("bad docHash: want 400, got %d %s", rec.Code, rec.Body)
	}
}

func TestAttestChecksTheLogoItWillRender(t *testing.T) {
	h, _ := newTestServerWith(t, hcs.New("0.0.1", nil))
	body := `{"docHash":"0x9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08","logo":%s}`
	// Every visitor's browser renders this, so the type is pinned: an SVG or a remote link is not
	// an image we control, and a huge payload is a file being pushed through a log.
	bad := []string{
		`"https://example.com/logo.png"`,
		`"data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="`,
		`"data:image/png;base64,not base64!!"`,
		`"data:image/png;base64,` + strings.Repeat("A", 13*1024) + `"`,
	}
	for _, b := range bad {
		rec := do(h, http.MethodPost, "/v1/invoices/INV-1/attest", fmt.Sprintf(body, b))
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("%s…: want 400, got %d", b[:40], rec.Code)
		}
	}
	// A small webp is what the browser actually sends, and it is accepted (503: HCS is disabled).
	rec := do(h, http.MethodPost, "/v1/invoices/INV-1/attest", fmt.Sprintf(body, `"data:image/webp;base64,UklGRg=="`))
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("valid logo: want 503 from the disabled anchor, got %d %s", rec.Code, rec.Body)
	}
}

// The document is what a gateway or an agent reads instead of our Go source, so it has to name
// the paid resource, its price and how the 402 works — and its server URL has to follow the
// request, since the API sits behind a proxy in production.
func TestOpenAPIDescribesThePaidResource(t *testing.T) {
	signer, err := quote.NewSigner(testKey, 296, testOracle)
	if err != nil {
		t.Fatal(err)
	}
	h := New(config.Config{
		ChainID:     296,
		X402Amount:  "10000",
		X402Asset:   "0.0.429274",
		X402Network: "hedera:testnet",
	}, Deps{Signer: signer, Anchor: hcs.New("", nil)})
	rec := do(h, http.MethodGet, "/openapi.json", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", rec.Code)
	}
	var doc struct {
		OpenAPI string           `json:"openapi"`
		Servers []map[string]any `json:"servers"`
		Paths   map[string]struct {
			Get struct {
				OperationID string                     `json:"operationId"`
				Description string                     `json:"description"`
				Responses   map[string]json.RawMessage `json:"responses"`
			} `json:"get"`
		} `json:"paths"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &doc); err != nil {
		t.Fatal(err)
	}
	if doc.OpenAPI != "3.1.0" {
		t.Fatalf("openapi version %q", doc.OpenAPI)
	}
	insights, ok := doc.Paths["/v1/market/insights"]
	if !ok {
		t.Fatal("the paid resource is not in the document")
	}
	if insights.Get.OperationID != "getMarketInsights" {
		t.Fatalf("operationId %q", insights.Get.OperationID)
	}
	if _, ok := insights.Get.Responses["402"]; !ok {
		t.Fatal("the 402 a caller must handle first is not described")
	}
	if !strings.Contains(insights.Get.Description, "0.01 USDC per call") {
		t.Fatalf("the price is not stated: %q", insights.Get.Description)
	}
	if len(doc.Servers) != 1 || doc.Servers[0]["url"] == "" {
		t.Fatalf("servers: %v", doc.Servers)
	}
}
