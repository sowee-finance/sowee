package kyc

import "testing"

func good() Answers {
	return Answers{
		"jurisdiction.residence":        "IDN",
		"jurisdiction.us_person":        "false",
		"jurisdiction.sanctioned":       "false",
		"classification.investor_class": "professional",
		"aml.source_of_funds":           "salary",
		"aml.pep":                       "false",
		"aml.beneficial_owner":          "true",
	}
}

func TestEvaluateTable(t *testing.T) {
	green := Review{Status: "completed", Answer: "GREEN"}
	cases := []struct {
		name   string
		review Review
		mutate func(Answers)
		want   Decision
	}{
		{"green + clean answers → eligible", green, func(Answers) {}, Eligible},
		{"review pending → pending", Review{Status: "pending"}, func(Answers) {}, Pending},
		{"red retry → pending", Review{Answer: "RED", RejectType: "RETRY"}, func(Answers) {}, Pending},
		{"red final → blocked", Review{Answer: "RED", RejectType: "FINAL"}, func(Answers) {}, Blocked},
		{"missing answer → held", green, func(a Answers) { delete(a, "aml.pep") }, Held},
		{"empty answers → held", green, func(a Answers) { clear(a) }, Held},
		{"us person → blocked", green, func(a Answers) { a["jurisdiction.us_person"] = "true" }, Blocked},
		{"self-declared sanctioned → blocked", green, func(a Answers) { a["jurisdiction.sanctioned"] = "yes" }, Blocked},
		{"residence PRK → blocked", green, func(a Answers) { a["jurisdiction.residence"] = "prk" }, Blocked},
		{"pep → held", green, func(a Answers) { a["aml.pep"] = "true" }, Held},
		{"not beneficial owner → held", green, func(a Answers) { a["aml.beneficial_owner"] = "false" }, Held},
		{"us person AND pep → blocked wins", green, func(a Answers) { a["jurisdiction.us_person"] = "true"; a["aml.pep"] = "true" }, Blocked},
	}
	for _, c := range cases {
		a := good()
		c.mutate(a)
		if got := Evaluate(c.review, a); got.Decision != c.want {
			t.Errorf("%s: want %s, got %s (%s)", c.name, c.want, got.Decision, got.Reason)
		}
	}
}

func TestBlockedIsNeverEligible(t *testing.T) {
	// property: any answer set with us_person=true must not be eligible whatever else is set
	for _, pep := range []string{"true", "false"} {
		for _, res := range []string{"IDN", "USA", "PRK"} {
			a := good()
			a["jurisdiction.us_person"] = "true"
			a["aml.pep"] = pep
			a["jurisdiction.residence"] = res
			if v := Evaluate(Review{Answer: "GREEN"}, a); v.Decision == Eligible {
				t.Fatalf("us person became eligible with pep=%s res=%s", pep, res)
			}
		}
	}
}
