// Package grant writes KYC eligibility on-chain: BondToken.setEligible on every live bond.
package grant

import (
	"context"
	"crypto/ecdsa"
	"fmt"
	"log"
	"math/big"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
)

const marketABI = `[
 {"type":"function","name":"listingCount","stateMutability":"view","inputs":[],"outputs":[{"type":"uint256"}]},
 {"type":"function","name":"invoiceIds","stateMutability":"view","inputs":[{"type":"uint256"}],"outputs":[{"type":"bytes32"}]},
 {"type":"function","name":"bondOf","stateMutability":"view","inputs":[{"type":"bytes32"}],"outputs":[{"type":"address"}]}
]`

const bondABI = `[
 {"type":"function","name":"isEligible","stateMutability":"view","inputs":[{"type":"address"}],"outputs":[{"type":"bool"}]},
 {"type":"function","name":"setEligible","stateMutability":"nonpayable","inputs":[{"type":"address"},{"type":"bool"}],"outputs":[]}
]`

// Granter holds the compliance operator key (COMPLIANCE_ROLE on every bond).
type Granter struct {
	client  *ethclient.Client
	key     *ecdsa.PrivateKey
	chainID *big.Int
	market  common.Address
	mABI    abi.ABI
	bABI    abi.ABI
	// Hedera bills at least 80% of the gas limit, so the pad is deliberate but modest.
	gasPad uint64 // percent, e.g. 130
}

// New dials the RPC and parses the operator key. An empty market yields a nil Granter.
func New(rpc, market, operatorKeyHex string, chainID int64) (*Granter, error) {
	if market == "" || operatorKeyHex == "" {
		return nil, nil
	}
	if !common.IsHexAddress(market) {
		return nil, fmt.Errorf("INVOICE_MARKET: %q is not an address", market)
	}
	key, err := crypto.HexToECDSA(strings.TrimPrefix(operatorKeyHex, "0x"))
	if err != nil {
		return nil, fmt.Errorf("COMPLIANCE_OPERATOR_PK: %w", err)
	}
	client, err := ethclient.Dial(rpc)
	if err != nil {
		return nil, fmt.Errorf("RPC_URL: %w", err)
	}
	m, _ := abi.JSON(strings.NewReader(marketABI))
	b, _ := abi.JSON(strings.NewReader(bondABI))
	return &Granter{client: client, key: key, chainID: big.NewInt(chainID), market: common.HexToAddress(market), mABI: m, bABI: b, gasPad: 130}, nil
}

// Operator is the address that must hold COMPLIANCE_ROLE.
func (g *Granter) Operator() common.Address { return crypto.PubkeyToAddress(g.key.PublicKey) }

// Bonds enumerates every listed bond.
func (g *Granter) Bonds(ctx context.Context) ([]common.Address, error) {
	var count *big.Int
	if err := g.view(ctx, g.market, g.mABI, "listingCount", &count); err != nil {
		return nil, err
	}
	out := make([]common.Address, 0, count.Int64())
	for i := int64(0); i < count.Int64(); i++ {
		var id [32]byte
		if err := g.view(ctx, g.market, g.mABI, "invoiceIds", &id, big.NewInt(i)); err != nil {
			return nil, err
		}
		var bond common.Address
		if err := g.view(ctx, g.market, g.mABI, "bondOf", &bond, id); err != nil {
			return nil, err
		}
		out = append(out, bond)
	}
	return out, nil
}

// Grant sets eligibility on every bond that does not have it yet. Returns the tx hashes.
func (g *Granter) Grant(ctx context.Context, wallet string) ([]string, error) {
	return g.set(ctx, common.HexToAddress(wallet), true)
}

// Revoke clears eligibility on every bond that has it.
func (g *Granter) Revoke(ctx context.Context, wallet string) ([]string, error) {
	return g.set(ctx, common.HexToAddress(wallet), false)
}

func (g *Granter) set(ctx context.Context, wallet common.Address, eligible bool) ([]string, error) {
	bonds, err := g.Bonds(ctx)
	if err != nil {
		return nil, err
	}
	var txs []string
	for _, bond := range bonds {
		var cur bool
		if err := g.view(ctx, bond, g.bABI, "isEligible", &cur, wallet); err != nil {
			return txs, err
		}
		if cur == eligible {
			continue
		}
		hash, err := g.send(ctx, bond, "setEligible", wallet, eligible)
		if err != nil {
			return txs, fmt.Errorf("setEligible on %s: %w", bond.Hex(), err)
		}
		txs = append(txs, hash)
		log.Printf("grant: %s eligible=%v on bond %s tx %s", wallet.Hex(), eligible, bond.Hex(), hash)
	}
	return txs, nil
}

func (g *Granter) view(ctx context.Context, to common.Address, a abi.ABI, method string, out any, args ...any) error {
	data, err := a.Pack(method, args...)
	if err != nil {
		return err
	}
	res, err := g.client.CallContract(ctx, ethereum.CallMsg{To: &to, Data: data}, nil)
	if err != nil {
		return fmt.Errorf("%s: %w", method, err)
	}
	return a.UnpackIntoInterface(out, method, res)
}

// send signs, submits and waits for one transaction; the gas limit is the estimate padded.
func (g *Granter) send(ctx context.Context, to common.Address, method string, args ...any) (string, error) {
	data, err := g.bABI.Pack(method, args...)
	if err != nil {
		return "", err
	}
	from := g.Operator()
	gas, err := g.client.EstimateGas(ctx, ethereum.CallMsg{From: from, To: &to, Data: data})
	if err != nil {
		return "", fmt.Errorf("estimate: %w", err)
	}
	opts, err := bind.NewKeyedTransactorWithChainID(g.key, g.chainID)
	if err != nil {
		return "", err
	}
	opts.Context = ctx
	opts.GasLimit = gas * g.gasPad / 100
	bound := bind.NewBoundContract(to, g.bABI, g.client, g.client, g.client)
	tx, err := bound.Transact(opts, method, args...)
	if err != nil {
		return "", err
	}
	waitCtx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()
	receipt, err := bind.WaitMined(waitCtx, g.client, tx)
	if err != nil {
		return tx.Hash().Hex(), fmt.Errorf("wait %s: %w", tx.Hash().Hex(), err)
	}
	if receipt.Status != types.ReceiptStatusSuccessful {
		return tx.Hash().Hex(), fmt.Errorf("tx %s reverted", tx.Hash().Hex())
	}
	return tx.Hash().Hex(), nil
}
