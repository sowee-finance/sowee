// Package market reads InvoiceMarket and BondToken state over JSON-RPC for the insights feed.
package market

import (
	"context"
	"fmt"
	"math/big"
	"sort"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/ethclient"
)

const marketABI = `[
 {"type":"function","name":"listingCount","stateMutability":"view","inputs":[],"outputs":[{"type":"uint256"}]},
 {"type":"function","name":"invoiceIds","stateMutability":"view","inputs":[{"type":"uint256"}],"outputs":[{"type":"bytes32"}]},
 {"type":"function","name":"listing","stateMutability":"view","inputs":[{"type":"bytes32"}],"outputs":[{"type":"tuple","components":[
   {"name":"bond","type":"address"},{"name":"issuer","type":"address"},{"name":"faceValue","type":"uint256"},
   {"name":"discountRateBps","type":"uint16"},{"name":"maturity","type":"uint64"}]}]}
]`

const bondABI = `[
 {"type":"function","name":"totalSupply","stateMutability":"view","inputs":[],"outputs":[{"type":"uint256"}]},
 {"type":"function","name":"symbol","stateMutability":"view","inputs":[],"outputs":[{"type":"string"}]}
]`

// Bond is one listed invoice bond with derived metrics.
type Bond struct {
	InvoiceID       string  `json:"invoiceId"`
	Bond            string  `json:"bond"`
	Symbol          string  `json:"symbol"`
	Issuer          string  `json:"issuer"`
	FaceValue       string  `json:"faceValue"`
	Supply          string  `json:"supply"`
	FundedPct       float64 `json:"fundedPct"`
	DiscountRateBps uint16  `json:"discountRateBps"`
	Maturity        int64   `json:"maturity"`
	TenorDays       int64   `json:"tenorDays"`
	ImpliedAprBps   int64   `json:"impliedAprBps"`
}

// Reader is nil-safe: a nil Reader reports an undeployed market.
type Reader struct {
	client    *ethclient.Client
	market    common.Address
	marketABI abi.ABI
	bondABI   abi.ABI
	now       func() time.Time
}

// New dials rpc; an empty market address yields a nil Reader.
func New(rpc, market string) (*Reader, error) {
	if market == "" {
		return nil, nil
	}
	if !common.IsHexAddress(market) {
		return nil, fmt.Errorf("INVOICE_MARKET: %q is not an address", market)
	}
	client, err := ethclient.Dial(rpc)
	if err != nil {
		return nil, fmt.Errorf("RPC_URL: %w", err)
	}
	m, _ := abi.JSON(strings.NewReader(marketABI))
	b, _ := abi.JSON(strings.NewReader(bondABI))
	return &Reader{client: client, market: common.HexToAddress(market), marketABI: m, bondABI: b, now: time.Now}, nil
}

// Address is the market contract, empty when not deployed.
func (r *Reader) Address() string {
	if r == nil {
		return ""
	}
	return r.market.Hex()
}

// Snapshot lists every bond, best implied APR first.
func (r *Reader) Snapshot(ctx context.Context) ([]Bond, error) {
	if r == nil {
		return []Bond{}, nil
	}
	var count *big.Int
	if err := r.call(ctx, r.market, r.marketABI, "listingCount", &count); err != nil {
		return nil, err
	}
	now := r.now().Unix()
	out := make([]Bond, 0, count.Int64())
	for i := int64(0); i < count.Int64(); i++ {
		var id [32]byte
		if err := r.call(ctx, r.market, r.marketABI, "invoiceIds", &id, big.NewInt(i)); err != nil {
			return nil, err
		}
		var l struct {
			Bond            common.Address
			Issuer          common.Address
			FaceValue       *big.Int
			DiscountRateBps uint16
			Maturity        uint64
		}
		if err := r.call(ctx, r.market, r.marketABI, "listing", &l, id); err != nil {
			return nil, err
		}
		var supply *big.Int
		var symbol string
		if err := r.call(ctx, l.Bond, r.bondABI, "totalSupply", &supply); err != nil {
			return nil, err
		}
		_ = r.call(ctx, l.Bond, r.bondABI, "symbol", &symbol)

		b := Bond{
			InvoiceID: "0x" + common.Bytes2Hex(id[:]), Bond: l.Bond.Hex(), Symbol: symbol, Issuer: l.Issuer.Hex(),
			FaceValue: l.FaceValue.String(), Supply: supply.String(), DiscountRateBps: l.DiscountRateBps,
			Maturity: int64(l.Maturity),
		}
		if l.FaceValue.Sign() > 0 {
			pct := new(big.Float).Quo(new(big.Float).SetInt(supply), new(big.Float).SetInt(l.FaceValue))
			b.FundedPct, _ = new(big.Float).Mul(pct, big.NewFloat(100)).Float64()
		}
		b.TenorDays, b.ImpliedAprBps = Yield(now, b.Maturity, b.DiscountRateBps)
		out = append(out, b)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ImpliedAprBps > out[j].ImpliedAprBps })
	return out, nil
}

// Yield annualises a discount over the remaining tenor: apr = rate × 365 / days (simple).
// Matured or same-day bonds report zero.
func Yield(now, maturity int64, rateBps uint16) (tenorDays, aprBps int64) {
	tenorDays = (maturity - now) / 86_400
	if tenorDays <= 0 {
		return tenorDays, 0
	}
	return tenorDays, int64(rateBps) * 365 / tenorDays
}

func (r *Reader) call(ctx context.Context, to common.Address, a abi.ABI, method string, out any, args ...any) error {
	data, err := a.Pack(method, args...)
	if err != nil {
		return err
	}
	res, err := r.client.CallContract(ctx, ethereum.CallMsg{To: &to, Data: data}, nil)
	if err != nil {
		return fmt.Errorf("%s: %w", method, err)
	}
	return a.UnpackIntoInterface(out, method, res)
}
