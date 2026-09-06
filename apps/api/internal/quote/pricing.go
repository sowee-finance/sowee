// Package quote prices invoices and signs EIP-712 discount quotes for DiscountOracle.sol.
package quote

import "errors"

const (
	baseRateBps   = 200  // 2% for anything under 30 days
	stepRateBps   = 25   // +0.25% per full 30-day block to maturity
	maxRateBps    = 2000 // policy cap; the oracle itself rejects above 5000
	secondsPerDay = 86_400
	daysPerStep   = 30
)

// ErrPastMaturity is returned when the invoice already matured at quote time.
var ErrPastMaturity = errors.New("maturity must be in the future")

// RateBps is the discount policy: 200 bps plus 25 bps per full 30 days between now and
// maturity (both unix seconds), capped at 2000 bps.
//
// ponytail: flat tenor curve, no issuer risk tier; add a risk input once KYC scoring exists.
func RateBps(now, maturity int64) (uint16, error) {
	if maturity <= now {
		return 0, ErrPastMaturity
	}
	days := (maturity - now) / secondsPerDay
	bps := baseRateBps + stepRateBps*(days/daysPerStep)
	if bps > maxRateBps {
		bps = maxRateBps
	}
	return uint16(bps), nil
}
