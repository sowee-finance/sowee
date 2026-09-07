package hcs

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// A consensus message holds at most 1 KB, so anything larger arrives in pieces. Each piece is a
// slice of bytes rather than a record: read one at a time, an attestation carrying a logo simply
// disappears from the trail.
func TestFetchTopicMessagesJoinsSplitSubmissions(t *testing.T) {
	whole := fmt.Sprintf(`{"type":"attestation.v1","invoiceId":"INV-1","docHash":"aa","logo":%q}`,
		"data:image/webp;base64,"+strings.Repeat("A", 2000))
	third := (len(whole) + 2) / 3
	id := map[string]any{"account_id": "0.0.7", "transaction_valid_start": "1788.1", "nonce": 0}

	msgs := []map[string]any{
		{"message": base64.StdEncoding.EncodeToString([]byte("{\"type\":\"x402.receipt.v1\"}")),
			"payer_account_id": "0.0.7"},
	}
	for i := range 3 {
		end := min((i+1)*third, len(whole))
		msgs = append(msgs, map[string]any{
			"message":          base64.StdEncoding.EncodeToString([]byte(whole[i*third : end])),
			"payer_account_id": "0.0.7",
			"chunk_info":       map[string]any{"initial_transaction_id": id, "number": i + 1, "total": 3},
		})
	}
	// A submission the mirror node has not finished serving: one piece of two.
	msgs = append(msgs, map[string]any{
		"message":          base64.StdEncoding.EncodeToString([]byte(`{"type":"attes`)),
		"payer_account_id": "0.0.7",
		"chunk_info": map[string]any{
			"initial_transaction_id": map[string]any{"account_id": "0.0.7", "transaction_valid_start": "1788.2", "nonce": 0},
			"number":                 1, "total": 2,
		},
	})

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"messages": msgs, "links": map[string]any{"next": nil}})
	}))
	defer srv.Close()

	got, err := FetchTopicMessages(context.Background(), srv.URL, "0.0.1", "0.0.7")
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 {
		t.Fatalf("want the receipt and the joined attestation, got %d messages", len(got))
	}
	var att Attestation
	if err := json.Unmarshal(got[1], &att); err != nil {
		t.Fatalf("the joined submission does not parse: %v", err)
	}
	if att.InvoiceID != "INV-1" || len(att.Logo) < 2000 {
		t.Fatalf("logo did not survive the join: %d bytes", len(att.Logo))
	}
}
