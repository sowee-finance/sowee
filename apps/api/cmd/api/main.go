// Command api serves the Sowee HTTP API: health and signed discount quotes.
package main

import (
	"context"
	"log"
	"net/http"
	"time"

	"github.com/sowee-finance/sowee/apps/api/internal/config"
	"github.com/sowee-finance/sowee/apps/api/internal/hcs"
	"github.com/sowee-finance/sowee/apps/api/internal/quote"
	"github.com/sowee-finance/sowee/apps/api/internal/server"
)

func main() {
	cfg := config.FromEnv()
	signer, err := quote.NewSigner(cfg.QuoteSignerPK, cfg.ChainID, cfg.DiscountOracle)
	if err != nil {
		log.Fatal(err)
	}
	anchor := newAnchor(cfg)
	log.Printf("api listening on :%s chainId=%d oracle=%s signer=%s hcsTopic=%q",
		cfg.Port, cfg.ChainID, cfg.DiscountOracle, signer.Address().Hex(), anchor.TopicID())
	log.Fatal(http.ListenAndServe(":"+cfg.Port, server.New(cfg, signer, anchor)))
}

// newAnchor wires HCS when operator credentials are present; otherwise anchoring is disabled
// and the attest endpoint answers 503. A missing topic id is created once and logged so it
// can be pinned in the environment.
func newAnchor(cfg config.Config) *hcs.Anchor {
	if cfg.HederaOperatorID == "" || cfg.HederaOperatorKey == "" {
		log.Print("hcs: disabled (set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY)")
		return hcs.New("", nil)
	}
	client, err := hcs.NewClient(cfg.HederaOperatorID, cfg.HederaOperatorKey)
	if err != nil {
		log.Fatal(err)
	}
	topic := cfg.HCSTopicID
	if topic == "" {
		if topic, err = hcs.CreateTopic(client, "sowee audit trail"); err != nil {
			log.Fatal(err)
		}
		log.Printf("hcs: created topic %s — set HCS_TOPIC_ID=%s to keep it", topic, topic)
	}
	sub, err := hcs.NewHieroSubmitter(client, topic)
	if err != nil {
		log.Fatal(err)
	}
	anchor := hcs.New(topic, sub)

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	msgs, err := hcs.FetchTopicMessages(ctx, cfg.MirrorURL, topic)
	if err != nil {
		log.Printf("hcs: could not replay topic %s from the mirror node: %v", topic, err)
	}
	log.Printf("hcs: topic %s, %d attestations replayed from %d messages", topic, anchor.Load(msgs), len(msgs))
	return anchor
}
