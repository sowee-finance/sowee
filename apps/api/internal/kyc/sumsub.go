package kyc

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"hash"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// ErrNotFound means Sumsub has no applicant for that external user id.
var ErrNotFound = errors.New("applicant not found")

// Applicant is the slice of a Sumsub applicant the flow needs.
type Applicant struct {
	ID        string
	Review    Review
	Answers   Answers
	Level     string
	CreatedAt string
}

// FixedInfo is the identity profile pre-filled by the wallet owner.
type FixedInfo struct {
	FirstName string `json:"firstName,omitempty"`
	LastName  string `json:"lastName,omitempty"`
	DOB       string `json:"dob,omitempty"`     // YYYY-MM-DD
	Country   string `json:"country,omitempty"` // ISO 3166-1 alpha-3
}

// SumsubAPI is what the orchestrator needs from Sumsub. Faked in tests.
type SumsubAPI interface {
	AccessToken(ctx context.Context, externalUserID string, ttl time.Duration) (string, error)
	Applicant(ctx context.Context, externalUserID string) (Applicant, error)
	CreateApplicant(ctx context.Context, externalUserID string) (string, error)
	SetFixedInfo(ctx context.Context, applicantID string, info FixedInfo) error
	SubmitQuestionnaire(ctx context.Context, applicantID string, answers Answers) error
}

// Sumsub is the HTTP client (sandbox or production, by base URL and token).
type Sumsub struct {
	Base, Token, Secret string
	Level               string // level name the applicants are created on
	QuestionnaireID     string
	HTTP                *http.Client
	now                 func() time.Time
}

// NewSumsub builds a client; Base defaults to the public API.
func NewSumsub(token, secret, level, questionnaireID string) *Sumsub {
	return &Sumsub{Base: "https://api.sumsub.com", Token: token, Secret: secret, Level: level,
		QuestionnaireID: questionnaireID, HTTP: &http.Client{Timeout: 20 * time.Second}, now: time.Now}
}

// Enabled reports whether credentials are configured.
func (s *Sumsub) Enabled() bool { return s != nil && s.Token != "" && s.Secret != "" }

// Sign computes the request signature: HMAC-SHA256(secret, ts + METHOD + pathWithQuery + body).
func Sign(secret, ts, method, pathWithQuery string, body []byte) string {
	m := hmac.New(sha256.New, []byte(secret))
	m.Write([]byte(ts + strings.ToUpper(method) + pathWithQuery))
	m.Write(body)
	return hex.EncodeToString(m.Sum(nil))
}

func (s *Sumsub) do(ctx context.Context, method, pathWithQuery string, body any, out any) (int, error) {
	var raw []byte
	if body != nil {
		var err error
		if raw, err = json.Marshal(body); err != nil {
			return 0, err
		}
	}
	req, err := http.NewRequestWithContext(ctx, method, s.Base+pathWithQuery, bytes.NewReader(raw))
	if err != nil {
		return 0, err
	}
	ts := strconv.FormatInt(s.now().Unix(), 10)
	req.Header.Set("X-App-Token", s.Token)
	req.Header.Set("X-App-Access-Ts", ts)
	req.Header.Set("X-App-Access-Sig", Sign(s.Secret, ts, method, pathWithQuery, raw))
	req.Header.Set("Accept", "application/json")
	if raw != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := s.HTTP.Do(req)
	if err != nil {
		return 0, fmt.Errorf("sumsub %s %s: %w", method, pathWithQuery, err)
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode == http.StatusNotFound {
		return resp.StatusCode, ErrNotFound
	}
	if resp.StatusCode/100 != 2 {
		var e struct {
			Description string `json:"description"`
		}
		_ = json.Unmarshal(data, &e)
		return resp.StatusCode, fmt.Errorf("sumsub %s %s: HTTP %d %s", method, pathWithQuery, resp.StatusCode, e.Description)
	}
	if out != nil && len(data) > 0 {
		return resp.StatusCode, json.Unmarshal(data, out)
	}
	return resp.StatusCode, nil
}

// AccessToken mints a WebSDK token bound to the wallet (externalUserId) and the level.
func (s *Sumsub) AccessToken(ctx context.Context, externalUserID string, ttl time.Duration) (string, error) {
	q := url.Values{"userId": {externalUserID}, "levelName": {s.Level}, "ttlInSecs": {strconv.Itoa(int(ttl.Seconds()))}}
	var out struct {
		Token string `json:"token"`
	}
	_, err := s.do(ctx, http.MethodPost, "/resources/accessTokens?"+q.Encode(), nil, &out)
	return out.Token, err
}

// Applicant fetches the applicant by external user id and flattens what the policy needs.
func (s *Sumsub) Applicant(ctx context.Context, externalUserID string) (Applicant, error) {
	var raw applicantJSON
	if _, err := s.do(ctx, http.MethodGet, "/resources/applicants/-;externalUserId="+url.PathEscape(externalUserID)+"/one", nil, &raw); err != nil {
		return Applicant{}, err
	}
	return raw.flatten(), nil
}

// CreateApplicant creates an applicant on the configured level.
func (s *Sumsub) CreateApplicant(ctx context.Context, externalUserID string) (string, error) {
	var out struct {
		ID string `json:"id"`
	}
	body := map[string]string{"externalUserId": externalUserID}
	_, err := s.do(ctx, http.MethodPost, "/resources/applicants?levelName="+url.QueryEscape(s.Level), body, &out)
	return out.ID, err
}

// SetFixedInfo writes the profile the wallet owner typed.
func (s *Sumsub) SetFixedInfo(ctx context.Context, applicantID string, info FixedInfo) error {
	_, err := s.do(ctx, http.MethodPatch, "/resources/applicants/"+applicantID+"/fixedInfo", info, nil)
	return err
}

// SubmitQuestionnaire posts the suitability answers.
func (s *Sumsub) SubmitQuestionnaire(ctx context.Context, applicantID string, answers Answers) error {
	_, err := s.do(ctx, http.MethodPost, "/resources/applicants/"+applicantID+"/questionnaires",
		QuestionnairePayload(s.QuestionnaireID, answers), nil)
	return err
}

// ---- wire shapes ------------------------------------------------------------------------

type applicantJSON struct {
	ID        string `json:"id"`
	CreatedAt string `json:"createdAt"`
	Review    struct {
		ReviewStatus string `json:"reviewStatus"`
		ReviewResult struct {
			ReviewAnswer     string `json:"reviewAnswer"`
			ReviewRejectType string `json:"reviewRejectType"`
		} `json:"reviewResult"`
		LevelName string `json:"levelName"`
	} `json:"review"`
	Questionnaires []questionnaireJSON `json:"questionnaires"`
}

type questionnaireJSON struct {
	ID       string `json:"id"`
	Sections map[string]struct {
		Items map[string]struct {
			Value  string   `json:"value"`
			Values []string `json:"values"`
		} `json:"items"`
	} `json:"sections"`
}

func (a applicantJSON) flatten() Applicant {
	out := Applicant{ID: a.ID, CreatedAt: a.CreatedAt, Level: a.Review.LevelName, Answers: Answers{}}
	out.Review = Review{Status: a.Review.ReviewStatus, Answer: a.Review.ReviewResult.ReviewAnswer, RejectType: a.Review.ReviewResult.ReviewRejectType}
	for _, q := range a.Questionnaires {
		for sec, sv := range q.Sections {
			for item, iv := range sv.Items {
				v := iv.Value
				if v == "" && len(iv.Values) > 0 {
					v = strings.Join(iv.Values, ",")
				}
				out.Answers[sec+"."+item] = v
			}
		}
	}
	return out
}

// QuestionnairePayload builds the submit body from "section.item" answers.
func QuestionnairePayload(id string, answers Answers) map[string]any {
	sections := map[string]any{}
	for k, v := range answers {
		sec, item, ok := strings.Cut(k, ".")
		if !ok {
			continue
		}
		s, _ := sections[sec].(map[string]any)
		if s == nil {
			s = map[string]any{"items": map[string]any{}}
			sections[sec] = s
		}
		s["items"].(map[string]any)[item] = map[string]any{"value": v}
	}
	return map[string]any{"id": id, "sections": sections}
}

// VerifyWebhook checks Sumsub's x-payload-digest over the raw body with the webhook secret.
// alg is the x-payload-digest-alg header: HMAC_SHA256_HEX (default), HMAC_SHA512_HEX, HMAC_SHA1_HEX.
func VerifyWebhook(secret, alg, digest string, body []byte) bool {
	var h func() hash.Hash
	switch strings.ToUpper(alg) {
	case "", "HMAC_SHA256_HEX":
		h = sha256.New
	case "HMAC_SHA512_HEX":
		h = sha512.New
	case "HMAC_SHA1_HEX":
		h = sha1.New
	default:
		return false
	}
	m := hmac.New(h, []byte(secret))
	m.Write(body)
	want := hex.EncodeToString(m.Sum(nil))
	return hmac.Equal([]byte(strings.ToLower(digest)), []byte(want))
}
