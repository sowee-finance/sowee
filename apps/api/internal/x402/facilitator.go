package x402

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// FacilitatorAPI is the slice of the facilitator the gate needs. Faked in tests.
type FacilitatorAPI interface {
	Supported(ctx context.Context) (Supported, error)
	Verify(ctx context.Context, p PaymentPayload, r PaymentRequirements) (VerifyResponse, error)
	Settle(ctx context.Context, p PaymentPayload, r PaymentRequirements) (SettleResponse, error)
}

// Facilitator talks to an x402 facilitator over HTTP (Blocky402 on Hedera testnet).
type Facilitator struct {
	Base string
	HTTP *http.Client
}

// NewFacilitator returns a client with a 30-second timeout (settlement waits for consensus).
func NewFacilitator(base string) *Facilitator {
	return &Facilitator{Base: base, HTTP: &http.Client{Timeout: 30 * time.Second}}
}

func (f *Facilitator) Supported(ctx context.Context) (Supported, error) {
	var out Supported
	return out, f.call(ctx, http.MethodGet, "/supported", nil, &out)
}

func (f *Facilitator) Verify(ctx context.Context, p PaymentPayload, r PaymentRequirements) (VerifyResponse, error) {
	var out VerifyResponse
	return out, f.call(ctx, http.MethodPost, "/verify", envelope(p, r), &out)
}

func (f *Facilitator) Settle(ctx context.Context, p PaymentPayload, r PaymentRequirements) (SettleResponse, error) {
	var out SettleResponse
	return out, f.call(ctx, http.MethodPost, "/settle", envelope(p, r), &out)
}

func envelope(p PaymentPayload, r PaymentRequirements) map[string]any {
	return map[string]any{"x402Version": Version, "paymentPayload": p, "paymentRequirements": r}
}

func (f *Facilitator) call(ctx context.Context, method, path string, body any, out any) error {
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			return err
		}
	}
	req, err := http.NewRequestWithContext(ctx, method, f.Base+path, &buf)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	resp, err := f.HTTP.Do(req)
	if err != nil {
		return fmt.Errorf("facilitator %s: %w", path, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		var e struct {
			Error string `json:"error"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&e)
		return fmt.Errorf("facilitator %s: HTTP %d %s", path, resp.StatusCode, e.Error)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}
