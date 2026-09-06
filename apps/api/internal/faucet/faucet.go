// Package faucet drips demo USDC to wallets that passed the Selfie Check signal.
package faucet

import (
	"context"
	"crypto/ecdsa"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"sync"
	"time"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
)

const erc20ABI = `[{"type":"function","name":"transfer","stateMutability":"nonpayable","inputs":[{"type":"address"},{"type":"uint256"}],"outputs":[{"type":"bool"}]}]`

// ErrCooldown means the wallet claimed recently.
var ErrCooldown = errors.New("faucet: already claimed recently")

// Faucet sends a fixed USDC amount from the treasury key, once per wallet per cooldown.
type Faucet struct {
	client   *ethclient.Client
	key      *ecdsa.PrivateKey
	chainID  *big.Int
	usdc     common.Address
	abi      abi.ABI
	Amount   *big.Int
	Cooldown time.Duration

	mu   sync.Mutex
	last map[string]time.Time
}

// New returns nil when usdc or the key is empty (feature off).
func New(rpc, usdc, keyHex string, chainID int64, amount uint64, cooldown time.Duration) (*Faucet, error) {
	if usdc == "" || keyHex == "" {
		return nil, nil
	}
	key, err := crypto.HexToECDSA(strings.TrimPrefix(keyHex, "0x"))
	if err != nil {
		return nil, fmt.Errorf("faucet key: %w", err)
	}
	client, err := ethclient.Dial(rpc)
	if err != nil {
		return nil, fmt.Errorf("RPC_URL: %w", err)
	}
	a, _ := abi.JSON(strings.NewReader(erc20ABI))
	return &Faucet{client: client, key: key, chainID: big.NewInt(chainID), usdc: common.HexToAddress(usdc), abi: a,
		Amount: new(big.Int).SetUint64(amount), Cooldown: cooldown, last: map[string]time.Time{}}, nil
}

// Enabled is nil-safe.
func (f *Faucet) Enabled() bool { return f != nil }

// Drip transfers Amount to the wallet and returns the tx hash.
func (f *Faucet) Drip(ctx context.Context, wallet string) (string, error) {
	w := strings.ToLower(wallet)
	f.mu.Lock()
	if t, ok := f.last[w]; ok && time.Since(t) < f.Cooldown {
		f.mu.Unlock()
		return "", ErrCooldown
	}
	f.last[w] = time.Now() // reserve the slot; released on failure below
	f.mu.Unlock()

	hash, err := f.send(ctx, common.HexToAddress(wallet))
	if err != nil {
		f.mu.Lock()
		delete(f.last, w)
		f.mu.Unlock()
		return "", err
	}
	return hash, nil
}

func (f *Faucet) send(ctx context.Context, to common.Address) (string, error) {
	data, err := f.abi.Pack("transfer", to, f.Amount)
	if err != nil {
		return "", err
	}
	from := crypto.PubkeyToAddress(f.key.PublicKey)
	gas, err := f.client.EstimateGas(ctx, ethereum.CallMsg{From: from, To: &f.usdc, Data: data})
	if err != nil {
		return "", fmt.Errorf("faucet: %w (is the wallet associated with USDC?)", err)
	}
	opts, err := bind.NewKeyedTransactorWithChainID(f.key, f.chainID)
	if err != nil {
		return "", err
	}
	opts.Context = ctx
	opts.GasLimit = gas * 130 / 100
	tx, err := bind.NewBoundContract(f.usdc, f.abi, f.client, f.client, f.client).Transact(opts, "transfer", to, f.Amount)
	if err != nil {
		return "", err
	}
	waitCtx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()
	receipt, err := bind.WaitMined(waitCtx, f.client, tx)
	if err != nil {
		return tx.Hash().Hex(), err
	}
	if receipt.Status != types.ReceiptStatusSuccessful {
		return tx.Hash().Hex(), fmt.Errorf("faucet tx %s reverted", tx.Hash().Hex())
	}
	return tx.Hash().Hex(), nil
}
