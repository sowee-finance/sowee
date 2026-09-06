package quote

import (
	"crypto/ecdsa"
	"fmt"
	"math/big"
	"sync"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/math"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/signer/core/apitypes"
)

// Validity is how long a signed quote stays acceptable to the oracle.
const Validity = 15 * time.Minute

// Quote mirrors DiscountOracle.Quote field for field.
type Quote struct {
	InvoiceID       common.Hash
	FaceValue       *big.Int
	DiscountRateBps uint16
	ValidUntil      uint64
	Nonce           uint64
}

// eip712Types is the EIP-712 schema of DiscountOracle.sol (domain "SoweeDiscountOracle"/"1").
var eip712Types = apitypes.Types{
	"EIP712Domain": {
		{Name: "name", Type: "string"},
		{Name: "version", Type: "string"},
		{Name: "chainId", Type: "uint256"},
		{Name: "verifyingContract", Type: "address"},
	},
	"Quote": {
		{Name: "invoiceId", Type: "bytes32"},
		{Name: "faceValue", Type: "uint256"},
		{Name: "discountRateBps", Type: "uint16"},
		{Name: "validUntil", Type: "uint64"},
		{Name: "nonce", Type: "uint64"},
	},
}

// Digest returns the EIP-712 hash DiscountOracle.hashQuote produces for q.
func Digest(chainID int64, oracle common.Address, q Quote) (common.Hash, error) {
	td := apitypes.TypedData{
		Types:       eip712Types,
		PrimaryType: "Quote",
		Domain: apitypes.TypedDataDomain{
			Name:              "SoweeDiscountOracle",
			Version:           "1",
			ChainId:           math.NewHexOrDecimal256(chainID),
			VerifyingContract: oracle.Hex(),
		},
		Message: apitypes.TypedDataMessage{
			"invoiceId":       q.InvoiceID[:],
			"faceValue":       q.FaceValue,
			"discountRateBps": new(big.Int).SetUint64(uint64(q.DiscountRateBps)),
			"validUntil":      new(big.Int).SetUint64(q.ValidUntil),
			"nonce":           new(big.Int).SetUint64(q.Nonce),
		},
	}
	hash, _, err := apitypes.TypedDataAndHash(td)
	if err != nil {
		return common.Hash{}, fmt.Errorf("eip712 digest: %w", err)
	}
	return common.BytesToHash(hash), nil
}

// Signer produces oracle-verifiable quotes with one private key.
type Signer struct {
	key     *ecdsa.PrivateKey
	chainID int64
	oracle  common.Address

	mu      sync.Mutex
	counter uint16
}

// NewSigner parses a hex private key (0x prefix optional) and the oracle address.
func NewSigner(hexKey string, chainID int64, oracle string) (*Signer, error) {
	if len(hexKey) > 2 && hexKey[:2] == "0x" {
		hexKey = hexKey[2:]
	}
	key, err := crypto.HexToECDSA(hexKey)
	if err != nil {
		return nil, fmt.Errorf("QUOTE_SIGNER_PK: %w", err)
	}
	if !common.IsHexAddress(oracle) {
		return nil, fmt.Errorf("DISCOUNT_ORACLE: %q is not an address", oracle)
	}
	return &Signer{key: key, chainID: chainID, oracle: common.HexToAddress(oracle)}, nil
}

// Address is the account the oracle must have as `signer`.
func (s *Signer) Address() common.Address {
	return crypto.PubkeyToAddress(s.key.PublicKey)
}

// NextNonce is unique across restarts: unix seconds in the high bits, a wrapping 16-bit
// counter in the low bits. Values stay below 2^53 until year 4000, so JSON clients are safe.
//
// ponytail: single process; move the counter to a shared store if the API is ever replicated.
func (s *Signer) NextNonce(now time.Time) uint64 {
	s.mu.Lock()
	defer s.mu.Unlock()
	n := uint64(now.Unix())<<16 | uint64(s.counter)
	s.counter++
	return n
}

// Sign returns the 65-byte r||s||v signature (v in {27,28}) and the digest it covers.
func (s *Signer) Sign(q Quote) (sig []byte, digest common.Hash, err error) {
	digest, err = Digest(s.chainID, s.oracle, q)
	if err != nil {
		return nil, common.Hash{}, err
	}
	sig, err = crypto.Sign(digest[:], s.key)
	if err != nil {
		return nil, common.Hash{}, fmt.Errorf("sign: %w", err)
	}
	sig[64] += 27 // go-ethereum yields v in {0,1}; ECDSA.recover wants {27,28}
	return sig, digest, nil
}
