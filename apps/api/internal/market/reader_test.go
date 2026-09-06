package market

import (
	"context"
	"testing"
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
