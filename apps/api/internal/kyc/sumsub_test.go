package kyc

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"testing"
)

func TestSignMatchesReferenceFormula(t *testing.T) {
	// ts + METHOD + path + body, HMAC-SHA256, hex — recomputed independently here
	m := hmac.New(sha256.New, []byte("s3cr3t"))
	m.Write([]byte("1700000000POST/resources/accessTokens?userId=0xabc&levelName=lvl&ttlInSecs=600"))
	want := hex.EncodeToString(m.Sum(nil))
	if got := Sign("s3cr3t", "1700000000", "post", "/resources/accessTokens?userId=0xabc&levelName=lvl&ttlInSecs=600", nil); got != want {
		t.Fatalf("sign mismatch: %s vs %s", got, want)
	}
}

func TestFlattenApplicant(t *testing.T) {
	raw := `{"id":"app1","createdAt":"2026-09-06","review":{"reviewStatus":"completed","levelName":"sowee-investor",
	  "reviewResult":{"reviewAnswer":"GREEN"}},
	  "questionnaires":[{"id":"sowee-investor-suitability","sections":{
	    "jurisdiction":{"items":{"residence":{"value":"IDN"},"us_person":{"value":"false"},"sanctioned":{"value":"false"}}},
	    "aml":{"items":{"pep":{"value":"false"},"source_of_funds":{"values":["salary","business"]}}}}}]}`
	var a applicantJSON
	if err := json.Unmarshal([]byte(raw), &a); err != nil {
		t.Fatal(err)
	}
	f := a.flatten()
	if f.ID != "app1" || f.Review.Answer != "GREEN" || f.Level != "sowee-investor" {
		t.Fatalf("bad header %+v", f)
	}
	if f.Answers["jurisdiction.residence"] != "IDN" || f.Answers["aml.pep"] != "false" || f.Answers["aml.source_of_funds"] != "salary,business" {
		t.Fatalf("bad answers %v", f.Answers)
	}
}

func TestQuestionnairePayloadShape(t *testing.T) {
	p := QuestionnairePayload("q1", Answers{"jurisdiction.residence": "IDN", "aml.pep": "false", "bad": "x"})
	b, _ := json.Marshal(p)
	var back struct {
		ID       string                                          `json:"id"`
		Sections map[string]map[string]map[string]map[string]any `json:"sections"`
	}
	if err := json.Unmarshal(b, &back); err != nil {
		t.Fatal(err)
	}
	if back.ID != "q1" || back.Sections["jurisdiction"]["items"]["residence"]["value"] != "IDN" || back.Sections["aml"]["items"]["pep"]["value"] != "false" {
		t.Fatalf("unexpected payload %s", b)
	}
	if _, ok := back.Sections["bad"]; ok {
		t.Fatal("keys without a section must be dropped")
	}
}

func TestVerifyWebhook(t *testing.T) {
	body := []byte(`{"type":"applicantReviewed"}`)
	m := hmac.New(sha256.New, []byte("whsec"))
	m.Write(body)
	digest := hex.EncodeToString(m.Sum(nil))
	if !VerifyWebhook("whsec", "HMAC_SHA256_HEX", digest, body) {
		t.Fatal("valid digest rejected")
	}
	if VerifyWebhook("whsec", "HMAC_SHA256_HEX", digest, []byte(`{"type":"tampered"}`)) {
		t.Fatal("tampered body accepted")
	}
	if VerifyWebhook("other", "", digest, body) {
		t.Fatal("wrong secret accepted")
	}
	if VerifyWebhook("whsec", "MD5", digest, body) {
		t.Fatal("unknown algorithm accepted")
	}
}
