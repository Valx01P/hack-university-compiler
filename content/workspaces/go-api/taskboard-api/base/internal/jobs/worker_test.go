package jobs

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"slices"
	"testing"
	"time"

	"example.com/taskboard/internal/clock"
)

// fakeStore is a jobs table in memory, enough to drive the worker by hand.
type fakeStore struct {
	jobs []*fakeJob
}

type fakeJob struct {
	Job
	status string
	runAt  time.Time
	runs   []time.Time // when it was claimed
}

func (s *fakeStore) Claim(_ context.Context, now time.Time, limit int) ([]Job, error) {
	var out []Job
	for _, j := range s.jobs {
		if len(out) < limit && j.status == "queued" && !j.runAt.After(now) {
			j.status = "running"
			j.Attempts++
			j.runs = append(j.runs, now)
			out = append(out, j.Job)
		}
	}
	return out, nil
}

func (s *fakeStore) find(id int64) *fakeJob {
	i := slices.IndexFunc(s.jobs, func(j *fakeJob) bool { return j.ID == id })
	return s.jobs[i]
}

func (s *fakeStore) Complete(_ context.Context, id int64) error {
	s.find(id).status = "completed"
	return nil
}

func (s *fakeStore) Retry(_ context.Context, id int64, runAt time.Time, _ string) error {
	j := s.find(id)
	j.status, j.runAt = "queued", runAt
	return nil
}

func (s *fakeStore) Kill(_ context.Context, id int64, _ string) error {
	s.find(id).status = "dead"
	return nil
}

// clockAt is a clock the test moves by hand.
type clockAt struct{ t time.Time }

func (c *clockAt) Now() time.Time { return c.t }

var _ clock.Clock = (*clockAt)(nil)

func TestRetriesWithBackoffThenDies(t *testing.T) {
	start := time.Date(2026, 10, 1, 9, 0, 0, 0, time.UTC)
	clk := &clockAt{t: start}
	failures := map[int64]int{1: 2, 2: 99} // job 1 fails twice, job 2 always
	store := &fakeStore{jobs: []*fakeJob{
		{Job: Job{ID: 1, Kind: "flaky", MaxAttempts: 5}, status: "queued", runAt: start},
		{Job: Job{ID: 2, Kind: "flaky", MaxAttempts: 5}, status: "queued", runAt: start},
	}}
	calls := map[int64]int{}
	handlers := map[string]Handler{"flaky": func(_ context.Context, payload []byte) error {
		id := int64(payload[0])
		calls[id]++
		if calls[id] <= failures[id] {
			return errors.New("the mail server is down")
		}
		return nil
	}}
	for _, j := range store.jobs {
		j.Payload = []byte{byte(j.ID)}
	}
	w := NewWorker(store, handlers, clk, slog.New(slog.NewTextHandler(io.Discard, nil)))
	for range 60 { // a minute, a second at a time
		if _, err := w.RunOnce(t.Context()); err != nil {
			t.Fatal(err)
		}
		clk.t = clk.t.Add(time.Second)
	}

	if j := store.find(1); j.status != "completed" || j.Attempts != 3 {
		t.Errorf("job 1: %s after %d attempts, want completed after 3", j.status, j.Attempts)
	}
	j := store.find(2)
	if j.status != "dead" || j.Attempts != 5 {
		t.Fatalf("job 2: %s after %d attempts, want dead after 5", j.status, j.Attempts)
	}
	var gaps []time.Duration
	for i := 1; i < len(j.runs); i++ {
		gaps = append(gaps, j.runs[i].Sub(j.runs[i-1]))
	}
	want := []time.Duration{2 * time.Second, 4 * time.Second, 8 * time.Second, 16 * time.Second}
	if !slices.Equal(gaps, want) {
		t.Errorf("waits between attempts = %v, want %v", gaps, want)
	}
}

func TestUnknownKindAndPanicsDoNotStopTheWorker(t *testing.T) {
	now := time.Date(2026, 10, 1, 9, 0, 0, 0, time.UTC)
	store := &fakeStore{jobs: []*fakeJob{
		{Job: Job{ID: 1, Kind: "mystery", MaxAttempts: 1}, status: "queued", runAt: now},
		{Job: Job{ID: 2, Kind: "boom", MaxAttempts: 1}, status: "queued", runAt: now},
		{Job: Job{ID: 3, Kind: "fine", MaxAttempts: 1}, status: "queued", runAt: now},
	}}
	handlers := map[string]Handler{
		"boom": func(context.Context, []byte) error { panic("bad payload") },
		"fine": func(context.Context, []byte) error { return nil },
	}
	w := NewWorker(store, handlers, clock.Fixed(now), slog.New(slog.NewTextHandler(io.Discard, nil)))
	if n, err := w.RunOnce(t.Context()); n != 3 || err != nil {
		t.Fatalf("RunOnce = %d, %v", n, err)
	}
	for id, want := range map[int64]string{1: "dead", 2: "dead", 3: "completed"} {
		if got := store.find(id).status; got != want {
			t.Errorf("job %d is %s, want %s", id, got, want)
		}
	}
}

func TestBackoff(t *testing.T) {
	for attempt, want := range map[int]time.Duration{1: 2 * time.Second, 4: 16 * time.Second, 12: time.Hour, 40: time.Hour} {
		if got := Backoff(attempt); got != want {
			t.Errorf("Backoff(%d) = %v, want %v", attempt, got, want)
		}
	}
}
