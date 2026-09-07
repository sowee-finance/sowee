package server

import (
	"fmt"
	"math/big"
	"net/http"

	"github.com/sowee-finance/sowee/apps/api/internal/config"
)

// The API describes itself. Agents and gateways are meant to discover the paid resource without
// reading Go source, and a document served by the running process cannot drift from it the way a
// checked-in file does. The x402 challenge is described where it belongs — on the operation that
// answers 402 — because that is the only part a caller has to understand before paying.
func openapiHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// The server URL comes from the request, the way the x402 challenge builds its resource
		// URL, so the document is correct behind a proxy without being told where it lives.
		scheme := "http"
		if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
			scheme = "https"
		}
		writeJSON(w, http.StatusOK, openapi(cfg, scheme+"://"+r.Host))
	}
}

// priceLabel renders the x402 amount the way a person reads it. USDC is 6 dp on both the Hedera
// and the Arc side, which is the only asset this endpoint has ever been priced in.
func priceLabel(cfg config.Config) string {
	amount, ok := new(big.Int).SetString(cfg.X402Amount, 10)
	if !ok {
		// Never render a half-formed price. An unconfigured gate is a fact worth stating.
		return "nothing — the payment gate is not configured on this instance"
	}
	whole := new(big.Rat).SetFrac(amount, big.NewInt(1_000_000))
	return fmt.Sprintf("%s USDC per call on %s (asset %s)",
		whole.FloatString(6), cfg.X402Network, cfg.X402Asset)
}

func openapi(cfg config.Config, publicURL string) map[string]any {
	money := func(desc string) map[string]any {
		return map[string]any{"type": "string", "description": desc}
	}
	bond := map[string]any{
		"type": "object",
		"properties": map[string]any{
			"invoiceId":       map[string]any{"type": "string", "description": "keccak256 of the issuer's invoice reference"},
			"bond":            map[string]any{"type": "string", "description": "bond token address"},
			"symbol":          map[string]any{"type": "string"},
			"issuer":          map[string]any{"type": "string", "description": "wallet that listed the invoice"},
			"faceValue":       money("repaid at maturity, USDC base units (6 dp)"),
			"supply":          money("units funded so far, same scale as faceValue"),
			"fundedPct":       map[string]any{"type": "number"},
			"discountRateBps": map[string]any{"type": "integer", "description": "issuance discount in basis points"},
			"maturity":        map[string]any{"type": "integer", "description": "unix seconds"},
			"tenorDays":       map[string]any{"type": "integer"},
			"impliedAprBps":   map[string]any{"type": "integer", "description": "annualised from the discount over the remaining tenor"},
		},
	}
	return map[string]any{
		"openapi": "3.1.0",
		"info": map[string]any{
			"title": "Sowee market insights",
			"description": "Every invoice bond listed on Sowee, with how much of it is funded, how long it has left " +
				"and what the discount annualises to. One paid call is a snapshot an agent can act on: it is " +
				"enough to choose a bond and size an order.\n\n" +
				"The endpoint is pay-per-call over x402. An unpaid GET answers 402 with a PAYMENT-REQUIRED " +
				"header holding the challenge; pay it and repeat the request with PAYMENT-SIGNATURE.",
			"version": "1.0.0",
			"contact": map[string]any{"url": "https://github.com/sowee-finance/sowee"},
			"license": map[string]any{"name": "MIT"},
		},
		"servers": []any{map[string]any{"url": publicURL}},
		"paths": map[string]any{
			"/v1/market/insights": map[string]any{
				"get": map[string]any{
					"operationId": "getMarketInsights",
					"summary":     "Every listed invoice bond, priced (paid)",
					"description": "Costs " + priceLabel(cfg) + ". Call it once, unpaid, to receive the " +
						"challenge; the PAYMENT-REQUIRED header is base64 JSON naming the scheme, network, asset, " +
						"amount and the account to pay. Settle it, then repeat the request with the receipt in " +
						"PAYMENT-SIGNATURE. The response carries PAYMENT-RESPONSE with the settlement transaction, " +
						"which is also anchored to the public audit topic.",
					"security": []any{map[string]any{"x402": []any{}}},
					"responses": map[string]any{
						"200": map[string]any{
							"description": "Market snapshot",
							"content": map[string]any{"application/json": map[string]any{"schema": map[string]any{
								"type": "object",
								"properties": map[string]any{
									"asOf":    map[string]any{"type": "string", "format": "date-time"},
									"chainId": map[string]any{"type": "integer"},
									"market":  map[string]any{"type": "string", "description": "InvoiceMarket address"},
									"bonds":   map[string]any{"type": "array", "items": bond},
									"best":    bond,
									"paidBy":  map[string]any{"type": "string", "description": "account that settled this call"},
									"note":    map[string]any{"type": "string"},
								},
							}}},
						},
						"402": map[string]any{
							"description": "Payment required. PAYMENT-REQUIRED holds the base64 x402 challenge.",
							"headers": map[string]any{"PAYMENT-REQUIRED": map[string]any{
								"schema":      map[string]any{"type": "string"},
								"description": "base64 JSON: x402Version, resource, accepts[{scheme, network, amount, asset, payTo, maxTimeoutSeconds, extra}]",
							}},
						},
					},
				},
			},
			"/v1/market/insights/usage": map[string]any{
				"get": map[string]any{
					"operationId": "getInsightsUsage",
					"summary":     "Who has paid for insights, and how often (free)",
					"responses": map[string]any{"200": map[string]any{
						"description": "Payers seen since the process started",
						"content": map[string]any{"application/json": map[string]any{"schema": map[string]any{
							"type":       "object",
							"properties": map[string]any{"payers": map[string]any{"type": "array", "items": map[string]any{"type": "object"}}},
						}}},
					}},
				},
			},
			"/v1/healthz": map[string]any{
				"get": map[string]any{
					"operationId": "getHealth",
					"summary":     "Chain, audit topic and quote signer this API is configured for (free)",
					"responses":   map[string]any{"200": map[string]any{"description": "OK"}},
				},
			},
		},
		"components": map[string]any{
			"securitySchemes": map[string]any{
				"x402": map[string]any{
					"type":        "apiKey",
					"in":          "header",
					"name":        "PAYMENT-SIGNATURE",
					"description": "x402 v2 receipt. Obtain the challenge from the 402 response, settle it, send the receipt here.",
				},
			},
		},
	}
}
