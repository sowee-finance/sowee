// Command api serves the Sowee HTTP API: health and signed discount quotes.
package main

import (
	"context"
	"log"
	"net/http"
	"time"

	"github.com/sowee-finance/sowee/apps/api/internal/config"
	"github.com/sowee-finance/sowee/apps/api/internal/grant"
	"github.com/sowee-finance/sowee/apps/api/internal/hcs"
	"github.com/sowee-finance/sowee/apps/api/internal/kyc"
	"github.com/sowee-finance/sowee/apps/api/internal/market"
	"github.com/sowee-finance/sowee/apps/api/internal/quote"
	"github.com/sowee-finance/sowee/apps/api/internal/server"
	"github.com/sowee-finance/sowee/apps/api/internal/x402"
)

func main() {
	cfg := config.FromEnv()
	signer, err := quote.NewSigner(cfg.QuoteSignerPK, cfg.ChainID, cfg.DiscountOracle)
	if err != nil {
		log.Fatal(err)
	}
	anchor := newAnchor(cfg)
	reader, err := market.New(cfg.RPCURL, cfg.InvoiceMarket)
	if err != nil {
		log.Fatal(err)
	}
	gate := x402.New(x402.NewFacilitator(cfg.X402FacilitatorURL), x402.PaymentRequirements{
		Network: cfg.X402Network, Asset: cfg.X402Asset, PayTo: cfg.X402PayTo, Amount: cfg.X402Amount,
	}, func(ctx context.Context, s x402.SettleResponse, r x402.PaymentRequirements, endpoint string) {
		if _, err := anchor.Receipt(ctx, hcs.Receipt{
			Endpoint: endpoint, Payer: s.Payer, Amount: r.Amount, Asset: r.Asset, SettlementTx: s.Transaction,
		}); err != nil {
			log.Printf("x402: receipt not anchored: %v", err)
		}
	})
	flow := newFlow(cfg)
	log.Printf("api listening on :%s chainId=%d oracle=%s signer=%s hcsTopic=%q market=%q x402=%s/%s→%s",
		cfg.Port, cfg.ChainID, cfg.DiscountOracle, signer.Address().Hex(), anchor.TopicID(),
		reader.Address(), cfg.X402Network, cfg.X402Amount, cfg.X402PayTo)
	log.Fatal(http.ListenAndServe(":"+cfg.Port, server.New(cfg, server.Deps{
		Signer: signer, Anchor: anchor, Gate: gate, Market: reader, KYC: flow,
	})))
}

// newFlow wires Sumsub and the on-chain granter. Without Sumsub credentials KYC endpoints
// answer 503; without a market address eligible wallets stay in "granting".
func newFlow(cfg config.Config) *kyc.Flow {
	var sumsub kyc.SumsubAPI
	if cfg.SumsubAppToken != "" && cfg.SumsubSecretKey != "" {
		sumsub = kyc.NewSumsub(cfg.SumsubAppToken, cfg.SumsubSecretKey, cfg.SumsubLevel, cfg.SumsubQuestionnaireID)
		log.Printf("kyc: sumsub level %q questionnaire %q", cfg.SumsubLevel, cfg.SumsubQuestionnaireID)
	} else {
		log.Print("kyc: disabled (set SUMSUB_APP_TOKEN and SUMSUB_SECRET_KEY)")
	}
	granter, err := grant.New(cfg.RPCURL, cfg.InvoiceMarket, cfg.ComplianceOperatorPK, cfg.ChainID)
	if err != nil {
		log.Fatal(err)
	}
	var grantor kyc.Grantor
	if granter != nil {
		grantor = granter
		log.Printf("kyc: granter %s on market %s", granter.Operator().Hex(), cfg.InvoiceMarket)
	}
	return kyc.NewFlow(sumsub, grantor)
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
