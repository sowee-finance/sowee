package kyc

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum/accounts"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/ethereum/go-ethereum/crypto"
)

// ChallengeWindow is how long a signed session challenge stays valid.
const ChallengeWindow = time.Hour

// ChallengeMessage is the exact EIP-191 (personal_sign) text the wallet signs to open a KYC
// session. Binding the wallet address and a timestamp keeps a signature from being reused
// for another wallet or replayed later.
func ChallengeMessage(wallet string, issuedAt time.Time) string {
	return fmt.Sprintf("Sowee KYC session\nWallet: %s\nIssued-At: %s",
		strings.ToLower(wallet), issuedAt.UTC().Format(time.RFC3339))
}

var (
	ErrBadWallet    = errors.New("wallet is not an address")
	ErrBadTimestamp = errors.New("issuedAt must be RFC3339")
	ErrExpired      = errors.New("challenge expired")
	ErrFuture       = errors.New("challenge issued in the future")
	ErrBadSignature = errors.New("signature does not match the wallet")
)

// VerifyChallenge checks a personal_sign signature over ChallengeMessage(wallet, issuedAt).
func VerifyChallenge(wallet, issuedAt, signature string, now time.Time) error {
	if !common.IsHexAddress(wallet) {
		return ErrBadWallet
	}
	at, err := time.Parse(time.RFC3339, issuedAt)
	if err != nil {
		return ErrBadTimestamp
	}
	if now.Sub(at) > ChallengeWindow {
		return ErrExpired
	}
	if at.Sub(now) > 5*time.Minute {
		return ErrFuture
	}
	sig, err := hexutil.Decode(signature)
	if err != nil || len(sig) != 65 {
		return ErrBadSignature
	}
	if sig[64] >= 27 {
		sig[64] -= 27
	}
	pub, err := crypto.SigToPub(accounts.TextHash([]byte(ChallengeMessage(wallet, at))), sig)
	if err != nil {
		return ErrBadSignature
	}
	if crypto.PubkeyToAddress(*pub) != common.HexToAddress(wallet) {
		return ErrBadSignature
	}
	return nil
}
