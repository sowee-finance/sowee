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
