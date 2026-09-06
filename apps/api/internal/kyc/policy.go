// Package kyc turns a Sumsub review plus the suitability questionnaire into an on-chain
// eligibility decision, and orchestrates the flow between wallet, Sumsub and the granter.
package kyc

import "strings"

// Decision is the outcome of the suitability policy.
type Decision string

const (
	Eligible Decision = "eligible"
	Blocked  Decision = "blocked" // never granted; a hard regulatory exclusion
	Held     Decision = "held"    // parked for manual compliance review
	Pending  Decision = "pending" // review not finished yet
)

// Verdict is a decision with the reason that produced it.
type Verdict struct {
	Decision Decision `json:"decision"`
	Reason   string   `json:"reason"`
}

// Review is the part of a Sumsub review the policy cares about.
type Review struct {
	Status     string // init | pending | completed | ...
	Answer     string // GREEN | RED (reviewResult.reviewAnswer)
	RejectType string // FINAL | RETRY (reviewResult.reviewRejectType)
}

// Answers are questionnaire values keyed "section.item" (see sowee-investor-suitability).
type Answers map[string]string

// Required questionnaire keys; a missing one holds the applicant (fail closed).
var required = []string{
	"jurisdiction.residence",
	"jurisdiction.us_person",
	"jurisdiction.sanctioned",
	"classification.investor_class",
	"aml.source_of_funds",
	"aml.pep",
	"aml.beneficial_owner",
}

// sanctionedResidence lists comprehensively sanctioned jurisdictions (ISO 3166-1 alpha-3).
var sanctionedResidence = map[string]bool{"IRN": true, "PRK": true, "CUB": true, "SYR": true}

// Evaluate is fail-closed: anything ambiguous is held, never granted.
func Evaluate(r Review, a Answers) Verdict {
	switch {
	case r.Answer == "RED" && strings.EqualFold(r.RejectType, "FINAL"):
		return Verdict{Blocked, "identity verification rejected"}
	case r.Answer == "RED":
		return Verdict{Pending, "identity verification needs a retry"}
	case r.Answer != "GREEN":
		return Verdict{Pending, "identity verification not completed"}
	}
	for _, k := range required {
		if strings.TrimSpace(a[k]) == "" {
			return Verdict{Held, "questionnaire incomplete: " + k}
		}
	}
	if isTrue(a["jurisdiction.us_person"]) {
		return Verdict{Blocked, "US person (Regulation S offering)"}
	}
	if isTrue(a["jurisdiction.sanctioned"]) {
		return Verdict{Blocked, "resident of a comprehensively sanctioned jurisdiction (self-declared)"}
	}
	if sanctionedResidence[strings.ToUpper(a["jurisdiction.residence"])] {
		return Verdict{Blocked, "resident of a comprehensively sanctioned jurisdiction"}
	}
	if isTrue(a["aml.pep"]) {
		return Verdict{Held, "politically exposed person — enhanced due diligence"}
	}
	if !isTrue(a["aml.beneficial_owner"]) {
		return Verdict{Held, "not the sole beneficial owner — review required"}
	}
	return Verdict{Eligible, "identity verified and suitability declarations passed"}
}

func isTrue(v string) bool {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "true", "yes", "1":
		return true
	}
	return false
}
