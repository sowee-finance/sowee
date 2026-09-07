// Package x402 gates an HTTP resource behind an x402 v2 payment settled by a facilitator.
//
// Wire format (x402 v2, HTTP transport): the server answers 402 with a base64 PaymentRequired
// in the PAYMENT-REQUIRED header; the client retries with a base64 PaymentPayload in
// PAYMENT-SIGNATURE; the server verifies and settles through the facilitator and returns the
// base64 SettlementResponse in PAYMENT-RESPONSE alongside the resource.
package x402

import "encoding/json"

// Version is the protocol version this package speaks.
const Version = 2

const (
	HeaderRequired  = "PAYMENT-REQUIRED"
	HeaderSignature = "PAYMENT-SIGNATURE"
	HeaderResponse  = "PAYMENT-RESPONSE"
	legacyHeader    = "X-PAYMENT" // v1 clients
)

// PaymentRequirements is one acceptable way to pay.
type PaymentRequirements struct {
	Scheme            string         `json:"scheme"`
	Network           string         `json:"network"`
	Amount            string         `json:"amount"`
	Asset             string         `json:"asset"`
	PayTo             string         `json:"payTo"`
	MaxTimeoutSeconds int            `json:"maxTimeoutSeconds"`
	Extra             map[string]any `json:"extra,omitempty"`
}

// Resource describes what is being sold.
type Resource struct {
	URL         string `json:"url"`
	Description string `json:"description,omitempty"`
	MimeType    string `json:"mimeType,omitempty"`
}

// PaymentRequired is the 402 challenge.
type PaymentRequired struct {
	X402Version int                   `json:"x402Version"`
	Error       string                `json:"error,omitempty"`
	Resource    Resource              `json:"resource"`
	Accepts     []PaymentRequirements `json:"accepts"`
}

// PaymentPayload is what the client sends back. Payload is scheme-specific: for Hedera it is
// {"transaction": "<base64 partially signed TransferTransaction>"}.
type PaymentPayload struct {
	X402Version int                 `json:"x402Version"`
	Resource    *Resource           `json:"resource,omitempty"`
	Accepted    PaymentRequirements `json:"accepted"`
	Payload     json.RawMessage     `json:"payload"`
}

// VerifyResponse is the facilitator's answer to POST /verify.
type VerifyResponse struct {
	IsValid       bool   `json:"isValid"`
	InvalidReason string `json:"invalidReason,omitempty"`
	Payer         string `json:"payer,omitempty"`
}

// SettleResponse is the facilitator's answer to POST /settle and the PAYMENT-RESPONSE body.
type SettleResponse struct {
	Success     bool   `json:"success"`
	ErrorReason string `json:"errorReason,omitempty"`
	Payer       string `json:"payer,omitempty"`
	Transaction string `json:"transaction"`
	Network     string `json:"network"`
	Amount      string `json:"amount,omitempty"`
}

// SupportedKind is one entry of GET /supported.
type SupportedKind struct {
	X402Version int            `json:"x402Version"`
	Scheme      string         `json:"scheme"`
	Network     string         `json:"network"`
	Extra       map[string]any `json:"extra,omitempty"`
}

// Supported is the facilitator's capability list.
type Supported struct {
	Kinds []SupportedKind `json:"kinds"`
}
