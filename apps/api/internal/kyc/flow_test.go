package kyc

import (
	"context"
	"errors"
	"testing"
	"time"
)

type fakeSumsub struct {
	apps    map[string]*Applicant
	created []string
	info    map[string]FixedInfo
	answers map[string]Answers
}

func newFakeSumsub() *fakeSumsub {
	return &fakeSumsub{apps: map[string]*Applicant{}, info: map[string]FixedInfo{}, answers: map[string]Answers{}}
}
func (f *fakeSumsub) AccessToken(context.Context, string, time.Duration) (string, error) {
	return "tok", nil
}
func (f *fakeSumsub) Applicant(_ context.Context, w string) (Applicant, error) {
	a, ok := f.apps[w]
	if !ok {
		return Applicant{}, ErrNotFound
	}
	return *a, nil
}
func (f *fakeSumsub) CreateApplicant(_ context.Context, w string) (string, error) {
	f.created = append(f.created, w)
	f.apps[w] = &Applicant{ID: "app-" + w, Review: Review{Status: "init"}, Answers: Answers{}}
	return "app-" + w, nil
}
func (f *fakeSumsub) SetFixedInfo(_ context.Context, id string, i FixedInfo) error {
	f.info[id] = i
	return nil
}
func (f *fakeSumsub) SubmitQuestionnaire(_ context.Context, id string, a Answers) error {
	f.answers[id] = a
	for _, app := range f.apps {
		if app.ID == id {
			app.Answers = a
		}
	}
	return nil
}

type fakeGrantor struct {
	calls []string
	err   error
	next  []string // txs returned by the next call; defaults to two
}

func (g *fakeGrantor) Revoke(_ context.Context, w string) ([]string, error) {
	g.calls = append(g.calls, "revoke:"+w)
	return []string{"0xrevoke"}, nil
}

func (g *fakeGrantor) Grant(_ context.Context, w string) ([]string, error) {
	g.calls = append(g.calls, w)
	if g.err != nil {
		return nil, g.err
	}
	if g.next != nil {
		out := g.next
		g.next = nil
		return out, nil
	}
	return []string{"0xtx1", "0xtx2"}, nil
}

const wallet = "0xABCDEF0000000000000000000000000000000001"

func TestSubmitProfileCreatesApplicantAndWritesQuestionnaire(t *testing.T) {
	s := newFakeSumsub()
	f := NewFlow(s, &fakeGrantor{})
	err := f.SubmitProfile(context.Background(), wallet, FixedInfo{FirstName: "Ana"}, good())
	if err != nil {
		t.Fatal(err)
	}
	if len(s.created) != 1 || s.created[0] != "0xabcdef0000000000000000000000000000000001" {
		t.Fatalf("applicant not created for the lowercase wallet: %v", s.created)
	}
	if s.info["app-0xabcdef0000000000000000000000000000000001"].FirstName != "Ana" {
		t.Fatal("fixed info not written")
	}
	// second submit reuses the applicant
	_ = f.SubmitProfile(context.Background(), wallet, FixedInfo{}, good())
	if len(s.created) != 1 {
		t.Fatal("applicant created twice")
	}
}

func TestStatusLifecycle(t *testing.T) {
	s := newFakeSumsub()
	g := &fakeGrantor{}
	f := NewFlow(s, g)
	ctx := context.Background()

	st, err := f.Status(ctx, wallet)
	if err != nil || st.State != StateNone {
		t.Fatalf("no applicant: %v %+v", err, st)
	}

	_ = f.SubmitProfile(ctx, wallet, FixedInfo{}, good())
	st, _ = f.Status(ctx, wallet)
	if st.State != StatePending {
		t.Fatalf("before review: want pending, got %s (%s)", st.State, st.Reason)
	}

	app := s.apps["0xabcdef0000000000000000000000000000000001"]
	app.Review = Review{Status: "completed", Answer: "GREEN"}
	st, _ = f.Status(ctx, wallet)
	if st.State != StateGranting {
		t.Fatalf("green: want granting, got %s", st.State)
	}
	f.Wait()
	st, _ = f.Status(ctx, wallet)
	if st.State != StateGranted || len(st.GrantTxs) != 2 || len(g.calls) != 1 {
		t.Fatalf("after grant: %+v calls=%v", st, g.calls)
	}
	// repeated status within the re-check window does not touch the chain
	_, _ = f.Status(ctx, wallet)
	f.Wait()
	if len(g.calls) != 1 {
		t.Fatalf("granted twice: %v", g.calls)
	}
}

func TestGrantedWalletIsRecheckedForBondsListedLater(t *testing.T) {
	s := newFakeSumsub()
	g := &fakeGrantor{}
	f := NewFlow(s, g)
	now := time.Date(2026, 9, 6, 12, 0, 0, 0, time.UTC)
	f.now = func() time.Time { return now }
	ctx := context.Background()
	_ = f.SubmitProfile(ctx, wallet, FixedInfo{}, good())
	s.apps["0xabcdef0000000000000000000000000000000001"].Review = Review{Answer: "GREEN"}
	_, _ = f.Status(ctx, wallet)
	f.Wait()

	// a new bond gets listed; within the window nothing happens
	g.next = []string{"0xtx-newbond"}
	st, _ := f.Status(ctx, wallet)
	f.Wait()
	if st.State != StateGranted || len(g.calls) != 1 {
		t.Fatalf("early recheck: %s calls=%v", st.State, g.calls)
	}
	// after the window the granter runs again and only the new bond's tx is appended
	now = now.Add(RecheckEvery + time.Second)
	st, _ = f.Status(ctx, wallet)
	f.Wait()
	st, _ = f.Status(ctx, wallet)
	if st.State != StateGranted || len(g.calls) != 2 || len(st.GrantTxs) != 3 || st.GrantTxs[2] != "0xtx-newbond" {
		t.Fatalf("late recheck: %+v calls=%v", st, g.calls)
	}
}

func TestBlockedAndHeldNeverGrant(t *testing.T) {
	for _, tc := range []struct {
		name string
		mut  func(Answers)
		want State
	}{
		{"us person", func(a Answers) { a["jurisdiction.us_person"] = "true" }, StateBlocked},
		{"pep", func(a Answers) { a["aml.pep"] = "true" }, StateHeld},
	} {
		s := newFakeSumsub()
		g := &fakeGrantor{}
		f := NewFlow(s, g)
		a := good()
		tc.mut(a)
		_ = f.SubmitProfile(context.Background(), wallet, FixedInfo{}, a)
		s.apps["0xabcdef0000000000000000000000000000000001"].Review = Review{Answer: "GREEN"}
		st, _ := f.Status(context.Background(), wallet)
		f.Wait()
		if st.State != tc.want || len(g.calls) != 0 {
			t.Fatalf("%s: want %s and no grant, got %s calls=%v", tc.name, tc.want, st.State, g.calls)
		}
	}
}

func TestGrantFailureStaysGrantingAndRetries(t *testing.T) {
	s := newFakeSumsub()
	g := &fakeGrantor{err: errors.New("INSUFFICIENT_PAYER_BALANCE")}
	f := NewFlow(s, g)
	_ = f.SubmitProfile(context.Background(), wallet, FixedInfo{}, good())
	s.apps["0xabcdef0000000000000000000000000000000001"].Review = Review{Answer: "GREEN"}
	st, _ := f.Status(context.Background(), wallet)
	f.Wait()
	if st.State != StateGranting {
		t.Fatalf("want granting, got %s", st.State)
	}
	g.err = nil
	_, _ = f.Status(context.Background(), wallet) // retries
	f.Wait()
	st, _ = f.Status(context.Background(), wallet)
	if st.State != StateGranted || len(g.calls) != 2 {
		t.Fatalf("retry: %+v calls=%v", st, g.calls)
	}
}

func TestWebhookReevaluates(t *testing.T) {
	s := newFakeSumsub()
	g := &fakeGrantor{}
	f := NewFlow(s, g)
	_ = f.SubmitProfile(context.Background(), wallet, FixedInfo{}, good())
	s.apps["0xabcdef0000000000000000000000000000000001"].Review = Review{Answer: "GREEN"}
	st, handled, err := f.Webhook(context.Background(), []byte(`{"type":"applicantReviewed","externalUserId":"`+wallet+`","reviewResult":{"reviewAnswer":"GREEN"}}`))
	if err != nil || !handled || st.State != StateGranting {
		t.Fatalf("webhook: %v %v %+v", err, handled, st)
	}
	_, handled, _ = f.Webhook(context.Background(), []byte(`{"type":"applicantPending","externalUserId":"x"}`))
	if handled {
		t.Fatal("other events must be ignored")
	}
	f.Wait()
	st, _ = f.Status(context.Background(), wallet)
	if st.State != StateGranted {
		t.Fatalf("want granted after webhook, got %s", st.State)
	}
}

func TestDisabled(t *testing.T) {
	f := NewFlow(nil, nil)
	if _, err := f.Session(context.Background(), wallet); !errors.Is(err, ErrDisabled) {
		t.Fatal("session should be disabled")
	}
	st, err := f.Status(context.Background(), wallet)
	if !errors.Is(err, ErrDisabled) || st.State != StateNone {
		t.Fatal("status should report disabled")
	}
}

func TestBlockedAfterGrantIsRevokedAndDeclarationsAreImmutableAfterReview(t *testing.T) {
	s := newFakeSumsub()
	g := &fakeGrantor{}
	f := NewFlow(s, g)
	ctx := context.Background()
	_ = f.SubmitProfile(ctx, wallet, FixedInfo{}, good())
	app := s.apps["0xabcdef0000000000000000000000000000000001"]
	app.Review = Review{Status: "completed", Answer: "GREEN"}
	_, _ = f.Status(ctx, wallet)
	f.Wait()

	if err := f.SubmitProfile(ctx, wallet, FixedInfo{}, good()); !errors.Is(err, ErrReviewed) {
		t.Fatalf("want ErrReviewed, got %v", err)
	}
	app.Answers["jurisdiction.sanctioned"] = "true"
	st, _ := f.Status(ctx, wallet)
	f.Wait()
	if st.State != StateBlocked || len(g.calls) != 2 || g.calls[1] != "revoke:0xabcdef0000000000000000000000000000000001" {
		t.Fatalf("revoke: %+v calls=%v", st, g.calls)
	}
}

func TestWalletNormalisation(t *testing.T) {
	a := norm("0xABCDEF0000000000000000000000000000000001")
	b := norm("abcdef0000000000000000000000000000000001")
	c := norm("0xabcdef0000000000000000000000000000000001")
	if a != b || b != c || a != "0xabcdef0000000000000000000000000000000001" {
		t.Fatalf("normalisation differs: %s %s %s", a, b, c)
	}
}
