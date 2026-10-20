// Package jobs runs background work that must not be lost: jobs are rows in the jobs
// table, written in the same transaction as the change that needs them (the outbox
// idea), and a Worker claims and runs them. A crash or a restart loses nothing,
// because a job leaves the table only by completing or dying.
package jobs

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"example.com/taskboard/internal/clock"
)

// Job is one row of the jobs table that a worker has claimed. Attempts counts this
// run too.
type Job struct {
	ID          int64
	Kind        string
	Payload     []byte
	Attempts    int
	MaxAttempts int
}

// Store is what the worker needs from the database.
type Store interface {
	// Claim marks up to limit queued jobs whose run_at has come as running and returns
	// them. Workers running at the same time never get the same job (FOR UPDATE SKIP
	// LOCKED).
	Claim(ctx context.Context, now time.Time, limit int) ([]Job, error)
	Complete(ctx context.Context, id int64) error
	Retry(ctx context.Context, id int64, runAt time.Time, lastErr string) error
	Kill(ctx context.Context, id int64, lastErr string) error
}

// Handler does one kind of job with its JSON payload.
type Handler func(ctx context.Context, payload []byte) error

// Worker claims queued jobs and runs the handler of each one's kind.
type Worker struct {
	store    Store
	handlers map[string]Handler
	clock    clock.Clock
	log      *slog.Logger

	Interval time.Duration // how often to look for jobs
	Batch    int           // how many jobs to claim at once
}

// NewWorker returns a Worker that looks for jobs every second, 10 at a time.
func NewWorker(store Store, handlers map[string]Handler, clk clock.Clock, log *slog.Logger) *Worker {
	return &Worker{store: store, handlers: handlers, clock: clk, log: log, Interval: time.Second, Batch: 10}
}

// Run works until ctx ends: every Interval it runs batches until the queue has no
// job that is due. It returns nil when ctx ends, after the job it is running.
func (w *Worker) Run(ctx context.Context) error {
	ticker := time.NewTicker(w.Interval)
	defer ticker.Stop()
	w.log.Info("job worker started", "interval", w.Interval.String(), "batch", w.Batch)
	for {
		for ctx.Err() == nil {
			n, err := w.RunOnce(ctx)
			if err != nil {
				if ctx.Err() == nil {
					w.log.Error("claim jobs", "err", err)
				}
				break
			}
			if n < w.Batch {
				break
			}
		}
		select {
		case <-ctx.Done():
			w.log.Info("job worker stopped")
			return nil
		case <-ticker.C:
		}
	}
}

// RunOnce claims up to Batch due jobs and runs them one by one. It returns how many it
// claimed.
func (w *Worker) RunOnce(ctx context.Context) (int, error) {
	// TODO: claim up to w.Batch due jobs with w.store.Claim at the clock's time, run
	// each one with w.run, and return how many were claimed.
	return 0, errors.New("Worker.RunOnce is not written yet")
}

// run does one job and records how it went. The bookkeeping uses a context that
// shutting down cannot cancel, so a finished job is never left marked running.
func (w *Worker) run(ctx context.Context, j Job) {
	log := w.log.With("job_id", j.ID, "kind", j.Kind, "attempt", j.Attempts)
	err := w.call(ctx, j)
	done := context.WithoutCancel(ctx)
	switch {
	case err == nil:
		if err := w.store.Complete(done, j.ID); err != nil {
			log.Error("complete job", "err", err)
			return
		}
		log.Info("job completed")
	case j.Attempts >= j.MaxAttempts:
		if err := w.store.Kill(done, j.ID, err.Error()); err != nil {
			log.Error("kill job", "err", err)
			return
		}
		log.Error("job dead", "err", err)
	default:
		runAt := w.clock.Now().Add(Backoff(j.Attempts))
		if err := w.store.Retry(done, j.ID, runAt, err.Error()); err != nil {
			log.Error("retry job", "err", err)
			return
		}
		log.Warn("job failed, will retry", "err", err, "run_at", runAt)
	}
}

// call runs the job's handler, turning a panic into an error, since one bad job must
// not take the server down with it.
func (w *Worker) call(ctx context.Context, j Job) (err error) {
	h, ok := w.handlers[j.Kind]
	if !ok {
		return fmt.Errorf("no handler for job kind %q", j.Kind)
	}
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("handler panicked: %v", r)
		}
	}()
	return h(ctx, j.Payload)
}

// Backoff is how long a job waits after its nth failed attempt: 2, 4, 8, 16 seconds,
// doubling up to an hour, so a broken dependency is not hammered.
func Backoff(attempt int) time.Duration {
	if attempt > 11 {
		return time.Hour
	}
	return min(time.Duration(1<<attempt)*time.Second, time.Hour)
}
