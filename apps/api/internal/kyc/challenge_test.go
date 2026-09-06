package kyc

import (
	"errors"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/accounts"
	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/ethereum/go-ethereum/crypto"
)

func signChallenge(t *testing.T, pk string, wallet string, at time.Time) string {
	t.Helper()
	key, _ := crypto.HexToECDSA(pk)
	sig, err := crypto.Sign(accounts.TextHash([]byte(ChallengeMessage(wallet, at))), key)
	if err != nil {
		t.Fatal(err)
	}
	sig[64] += 27 // as wallets return it
	return hexutil.Encode(sig)
}

func TestVerifyChallenge(t *testing.T) {
	const pk = "00000000000000000000000000000000000000000000000000000000000a11ce"
	key, _ := crypto.HexToECDSA(pk)
	wallet := crypto.PubkeyToAddress(key.PublicKey).Hex()
	now := time.Date(2026, 9, 6, 12, 0, 0, 0, time.UTC)
	at := now.Add(-10 * time.Minute)
	sig := signChallenge(t, pk, wallet, at)

	if err := VerifyChallenge(wallet, at.Format(time.RFC3339), sig, now); err != nil {
		t.Fatalf("valid challenge rejected: %v", err)
	}
	// case-insensitive wallet
	if err := VerifyChallenge(wallet[:2]+"0x"[2:]+wallet[2:], at.Format(time.RFC3339), sig, now); err != nil {
		t.Fatalf("mixed case rejected: %v", err)
	}
	if err := VerifyChallenge(wallet, at.Format(time.RFC3339), sig, now.Add(2*time.Hour)); !errors.Is(err, ErrExpired) {
		t.Fatalf("want expired, got %v", err)
	}
	other := "0x000000000000000000000000000000000000dEaD"
	if err := VerifyChallenge(other, at.Format(time.RFC3339), sig, now); !errors.Is(err, ErrBadSignature) {
		t.Fatalf("want bad signature for another wallet, got %v", err)
	}
	if err := VerifyChallenge(wallet, "yesterday", sig, now); !errors.Is(err, ErrBadTimestamp) {
		t.Fatalf("want bad timestamp, got %v", err)
	}
	if err := VerifyChallenge("nope", at.Format(time.RFC3339), sig, now); !errors.Is(err, ErrBadWallet) {
		t.Fatalf("want bad wallet, got %v", err)
	}
	if err := VerifyChallenge(wallet, at.Add(time.Minute).Format(time.RFC3339), sig, now); !errors.Is(err, ErrBadSignature) {
		t.Fatalf("want bad signature for a shifted timestamp, got %v", err)
	}
}
