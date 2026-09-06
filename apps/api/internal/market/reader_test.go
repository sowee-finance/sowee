package market

import (
	"context"
	"math/big"
	"strings"
	"testing"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
)

func TestYield(t *testing.T) {
	cases := []struct {
		days       int64
		rate       uint16
		wantAprBps int64
	}{
		{30, 300, 3650}, // 3% over 30 days ≈ 36.5% simple APR
		{90, 300, 1216},
		{365, 300, 300},
		{0, 300, 0},
		{-5, 300, 0},
	}
	for _, c := range cases {
		_, apr := Yield(0, c.days*86_400, c.rate)
		if apr != c.wantAprBps {
			t.Errorf("days=%d rate=%d: want %d, got %d", c.days, c.rate, c.wantAprBps, apr)
		}
	}
}

func TestNilReaderIsUndeployed(t *testing.T) {
	var r *Reader
	bonds, err := r.Snapshot(context.Background())
	if err != nil || len(bonds) != 0 || r.Address() != "" {
		t.Fatalf("nil reader: %v %v %q", err, bonds, r.Address())
	}
	if _, err := New("http://127.0.0.1:1", "not-an-address"); err == nil {
		t.Fatal("bad address must error")
	}
}

func TestUnpackListingDecodesTheWholeTuple(t *testing.T) {
	// Regression: unpacking straight into a struct made go-ethereum write the tuple into the
	// first field and panic ("reflect.Value.Len on struct Value"), which took down /market/insights
	// the moment a bond was listed.
	a, err := abi.JSON(strings.NewReader(marketABI))
	if err != nil {
		t.Fatal(err)
	}
	want := Listing{
		Bond:            common.HexToAddress("0xcfDeA74C43784D10364Befa3a2a3aDD472306600"),
		Issuer:          common.HexToAddress("0x17CaD6366c73955bBb05194882D5B906B5D1c116"),
		FaceValue:       big.NewInt(100_000_000),
		DiscountRateBps: 225,
		Maturity:        1_791_000_000,
	}
	enc, err := a.Methods["listing"].Outputs.Pack(want)
	if err != nil {
		t.Fatal(err)
	}
	got, err := unpackListing(a, enc)
	if err != nil {
		t.Fatal(err)
	}
	if got.Bond != want.Bond || got.Issuer != want.Issuer || got.DiscountRateBps != want.DiscountRateBps ||
		got.Maturity != want.Maturity || got.FaceValue.Cmp(want.FaceValue) != 0 {
		t.Fatalf("listing round-trip: got %+v, want %+v", got, want)
	}
}
