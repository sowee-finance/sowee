// Package config reads the service configuration from environment variables.
package config

import (
	"os"
	"strconv"
)

// Config is everything the API needs to start. Defaults target Hedera testnet.
type Config struct {
	Port           string // PORT, default 8080
	ChainID        int64  // CHAIN_ID, default 296 (Hedera testnet)
	DiscountOracle string // DISCOUNT_ORACLE, address of the deployed DiscountOracle
	QuoteSignerPK  string // QUOTE_SIGNER_PK, hex private key whose address the oracle trusts

	HCSTopicID        string // HCS_TOPIC_ID, audit topic; created at startup when empty and an operator is set
	HederaOperatorID  string // HEDERA_OPERATOR_ID, e.g. 0.0.7162116 — pays for HCS messages
	HederaOperatorKey string // HEDERA_OPERATOR_KEY, hex ECDSA private key of the operator
	MirrorURL         string // MIRROR_URL, default https://testnet.mirrornode.hedera.com

	RPCURL        string // RPC_URL, default https://testnet.hashio.io/api
	InvoiceMarket string // INVOICE_MARKET, deployed market address; insights are empty when unset

	X402FacilitatorURL string // X402_FACILITATOR_URL, default https://api.testnet.blocky402.com
	X402Network        string // X402_NETWORK, default hedera:testnet
	X402Asset          string // X402_ASSET, default 0.0.429274 (USDC on Hedera testnet)
	X402PayTo          string // X402_PAY_TO, default HEDERA_OPERATOR_ID
	X402Amount         string // X402_AMOUNT in asset base units, default 10000 (0.01 USDC)

	SumsubAppToken        string // SUMSUB_APP_TOKEN (sandbox: sbx:…); KYC disabled when empty
	SumsubSecretKey       string // SUMSUB_SECRET_KEY
	SumsubLevel           string // SUMSUB_LEVEL, default sowee-investor
	SumsubQuestionnaireID string // SUMSUB_QUESTIONNAIRE_ID, default sowee-investor-suitability
	SumsubWebhookSecret   string // SUMSUB_WEBHOOK_SECRET, verifies x-payload-digest
	ComplianceOperatorPK  string // COMPLIANCE_OPERATOR_PK, holds COMPLIANCE_ROLE; defaults to QUOTE_SIGNER_PK
}

// FromEnv builds a Config from the process environment.
func FromEnv() Config {
	return Config{
		Port:           env("PORT", "8080"),
		ChainID:        envInt("CHAIN_ID", 296),
		DiscountOracle: os.Getenv("DISCOUNT_ORACLE"),
		QuoteSignerPK:  os.Getenv("QUOTE_SIGNER_PK"),

		HCSTopicID:        os.Getenv("HCS_TOPIC_ID"),
		HederaOperatorID:  os.Getenv("HEDERA_OPERATOR_ID"),
		HederaOperatorKey: os.Getenv("HEDERA_OPERATOR_KEY"),
		MirrorURL:         env("MIRROR_URL", "https://testnet.mirrornode.hedera.com"),

		RPCURL:        env("RPC_URL", "https://testnet.hashio.io/api"),
		InvoiceMarket: os.Getenv("INVOICE_MARKET"),

		X402FacilitatorURL: env("X402_FACILITATOR_URL", "https://api.testnet.blocky402.com"),
		X402Network:        env("X402_NETWORK", "hedera:testnet"),
		X402Asset:          env("X402_ASSET", "0.0.429274"),
		X402PayTo:          env("X402_PAY_TO", os.Getenv("HEDERA_OPERATOR_ID")),
		X402Amount:         env("X402_AMOUNT", "10000"),

		SumsubAppToken:        os.Getenv("SUMSUB_APP_TOKEN"),
		SumsubSecretKey:       os.Getenv("SUMSUB_SECRET_KEY"),
		SumsubLevel:           env("SUMSUB_LEVEL", "sowee-investor"),
		SumsubQuestionnaireID: env("SUMSUB_QUESTIONNAIRE_ID", "sowee-investor-suitability"),
		SumsubWebhookSecret:   os.Getenv("SUMSUB_WEBHOOK_SECRET"),
		ComplianceOperatorPK:  env("COMPLIANCE_OPERATOR_PK", os.Getenv("QUOTE_SIGNER_PK")),
	}
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func envInt(key string, def int64) int64 {
	if v, err := strconv.ParseInt(os.Getenv(key), 10, 64); err == nil {
		return v
	}
	return def
}
