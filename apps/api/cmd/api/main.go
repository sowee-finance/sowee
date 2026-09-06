// Command api serves the Sowee HTTP API: health and signed discount quotes.
package main

import (
	"log"
	"net/http"

	"github.com/sowee-finance/sowee/apps/api/internal/config"
	"github.com/sowee-finance/sowee/apps/api/internal/quote"
	"github.com/sowee-finance/sowee/apps/api/internal/server"
)

func main() {
	cfg := config.FromEnv()
	signer, err := quote.NewSigner(cfg.QuoteSignerPK, cfg.ChainID, cfg.DiscountOracle)
	if err != nil {
		log.Fatal(err)
	}
	log.Printf("api listening on :%s chainId=%d oracle=%s signer=%s",
		cfg.Port, cfg.ChainID, cfg.DiscountOracle, signer.Address().Hex())
	log.Fatal(http.ListenAndServe(":"+cfg.Port, server.New(cfg, signer)))
}
