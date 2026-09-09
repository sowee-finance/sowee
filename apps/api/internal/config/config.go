// Package config reads the service configuration from environment variables.
package config

import (
	"os"
	"strconv"
	"strings"
	"time"
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

	WorldAppID        string // WORLD_APP_ID (app_…); World Selfie Check is off unless app, rp id and key are set
	WorldRPID         string // WORLD_RP_ID (rp_…)
	WorldRPSigningKey string // WORLD_RP_SIGNING_KEY, 32-byte hex from the Developer Portal
	WorldAction       string // WORLD_ACTION, default sowee-selfie-check
	WorldEnvironment  string // WORLD_ENVIRONMENT, sandbox (default) or production
	WorldVerifyURL    string // WORLD_VERIFY_URL, default https://developer.world.org/api/v4/verify

	USDCAddress    string        // USDC_ADDRESS (EVM), default Hedera testnet USDC 0x…68cDa; used by the faucet
	FaucetAmount   uint64        // FAUCET_USDC_AMOUNT in base units, default 1000000 (1 USDC); 0 disables
	FaucetCooldown time.Duration // FAUCET_COOLDOWN, default 24h
	WebOrigins     []string      // WEB_ORIGIN, comma-separated; "*" opens it to any page
	TrustedProxy   bool          // TRUSTED_PROXY=true when a proxy in front sets X-Forwarded-For
	RateBase       int           // RATE_BASE_PER_MIN, default 30 (per client IP)
	RateVerified   int           // RATE_VERIFIED_PER_MIN, default 300 (per Selfie-verified wallet)
	RequireSelfie  bool          // REQUIRE_SELFIE_CHECK=true makes Selfie Check a condition of eligibility
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

		WorldAppID:        os.Getenv("WORLD_APP_ID"),
		WorldRPID:         os.Getenv("WORLD_RP_ID"),
		WorldRPSigningKey: os.Getenv("WORLD_RP_SIGNING_KEY"),
		WorldAction:       env("WORLD_ACTION", "sowee-selfie-check"),
		WorldEnvironment:  env("WORLD_ENVIRONMENT", "sandbox"),
		WorldVerifyURL:    os.Getenv("WORLD_VERIFY_URL"),

		USDCAddress:    env("USDC_ADDRESS", "0x0000000000000000000000000000000000068cDa"),
		FaucetAmount:   uint64(envInt("FAUCET_USDC_AMOUNT", 1_000_000)),
		FaucetCooldown: envDuration("FAUCET_COOLDOWN", 24*time.Hour),
		WebOrigins:     splitList(env("WEB_ORIGIN", "http://localhost:3000")),
		TrustedProxy:   os.Getenv("TRUSTED_PROXY") == "true",
		RequireSelfie:  os.Getenv("REQUIRE_SELFIE_CHECK") == "true",
		RateBase:       int(envInt("RATE_BASE_PER_MIN", 30)),
		RateVerified:   int(envInt("RATE_VERIFIED_PER_MIN", 300)),
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

func envDuration(key string, def time.Duration) time.Duration {
	if v, err := time.ParseDuration(os.Getenv(key)); err == nil {
		return v
	}
	return def
}

// X402AssetEVM is the EVM address of the settlement asset (USDC).
func (c Config) X402AssetEVM() string { return c.USDCAddress }

// splitList reads a comma-separated env value, dropping blanks.
func splitList(value string) []string {
	var out []string
	for _, part := range strings.Split(value, ",") {
		if p := strings.TrimSpace(part); p != "" {
			out = append(out, p)
		}
	}
	return out
}
