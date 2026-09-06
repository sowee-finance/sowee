package quote

import (
	"math/big"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
)

// Pinned against contracts/test/QuoteVector.t.sol (DiscountOracle.hashQuote on chain 296).
const (
	vectorOracle = "0x1111111111111111111111111111111111111111"
	vectorDigest = "0x5b0882ed8db5191c229239578fad37ba5792de7c0f5aed352a241a541b0536a3"
	testKey      = "0x00000000000000000000000000000000000000000000000000000000000a11ce"
)

func vectorQuote() Quote {
	return Quote{
		InvoiceID:       crypto.Keccak256Hash([]byte("INV-1")),
		Issuer:          common.HexToAddress("0x2222222222222222222222222222222222222222"),
		FaceValue:       big.NewInt(10_000_000_000),
		Maturity:        1_802_592_000,
		DiscountRateBps: 300,
		ValidUntil:      1_800_000_000,
		Nonce:           42,
	}
}

func TestDigestMatchesSolidityVector(t *testing.T) {
	got, err := Digest(296, common.HexToAddress(vectorOracle), vectorQuote())
	if err != nil {
		t.Fatal(err)
	}
	if got != common.HexToHash(vectorDigest) {
		t.Fatalf("digest = %s, want %s", got, vectorDigest)
	}
}

func TestSignRecoversToSigner(t *testing.T) {
	s, err := NewSigner(testKey, 296, vectorOracle)
	if err != nil {
		t.Fatal(err)
	}
	sig, digest, err := s.Sign(vectorQuote())
	if err != nil {
		t.Fatal(err)
	}
	if len(sig) != 65 || (sig[64] != 27 && sig[64] != 28) {
		t.Fatalf("want 65-byte r||s||v with v in {27,28}, got len=%d v=%d", len(sig), sig[64])
	}
	if digest != common.HexToHash(vectorDigest) {
		t.Fatalf("digest = %s, want %s", digest, vectorDigest)
	}
	raw := append([]byte(nil), sig...)
	raw[64] -= 27
	pub, err := crypto.SigToPub(digest[:], raw)
	if err != nil {
		t.Fatal(err)
	}
	if got := crypto.PubkeyToAddress(*pub); got != s.Address() {
		t.Fatalf("recovered %s, want %s", got, s.Address())
	}
}

func TestNextNonceIsUniqueAndOrdered(t *testing.T) {
	s := &Signer{}
	now := time.Unix(1_800_000_000, 0)
	a, b := s.NextNonce(now), s.NextNonce(now)
	if a>>16 != 1_800_000_000 || b != a+1 {
		t.Fatalf("nonces %d %d: want unix<<16 | counter", a, b)
	}
	s.counter = 0xFFFF
	if got := s.NextNonce(now); got&0xFFFF != 0xFFFF || s.counter != 0 {
		t.Fatalf("counter must wrap at 16 bits, got nonce=%d counter=%d", got, s.counter)
	}
}

func TestNewSignerRejectsBadInput(t *testing.T) {
	if _, err := NewSigner("nothex", 296, vectorOracle); err == nil {
		t.Fatal("bad key accepted")
	}
	if _, err := NewSigner(testKey, 296, "0x1234"); err == nil {
		t.Fatal("bad oracle address accepted")
	}
}
