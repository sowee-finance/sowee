package quote

import "testing"

func TestRateBps(t *testing.T) {
	const now = 1_800_000_000
	cases := []struct {
		name     string
		maturity int64
		want     uint16
		wantErr  error
	}{
		{"past", now - 1, 0, ErrPastMaturity},
		{"now", now, 0, ErrPastMaturity},
		{"one second", now + 1, 200, nil},
		{"29 days", now + 29*secondsPerDay, 200, nil},
		{"30 days", now + 30*secondsPerDay, 225, nil},
		{"59 days", now + 59*secondsPerDay, 225, nil},
		{"90 days", now + 90*secondsPerDay, 275, nil},
		{"360 days", now + 360*secondsPerDay, 500, nil},
		{"2160 days hits cap", now + 2160*secondsPerDay, 2000, nil},
		{"50 years stays capped", now + 50*365*secondsPerDay, 2000, nil},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, err := RateBps(now, c.maturity)
			if err != c.wantErr {
				t.Fatalf("err = %v, want %v", err, c.wantErr)
			}
			if got != c.want {
				t.Fatalf("rate = %d, want %d", got, c.want)
			}
		})
	}
}
