package store

import (
	"cmp"
	"context"
	"encoding/json"
	"fmt"
	"slices"
	"time"

	"example.com/taskboard/internal/domain"
	"example.com/taskboard/internal/jobs"
	"example.com/taskboard/internal/store/sqlcdb"
)

// JobRepo is the PostgreSQL job queue: the services' JobQueue, the worker's
// jobs.Store, and the handlers' jobs.Notifier.
type JobRepo struct{ s *Store }

// NewJobRepo returns the job repository of s.
func NewJobRepo(s *Store) *JobRepo { return &JobRepo{s: s} }

// Enqueue stores a job with its payload as JSON. Called with a ctx inside a
// transaction, the job is part of that transaction: it exists only if it commits.
func (r *JobRepo) Enqueue(ctx context.Context, kind string, payload any, runAt time.Time) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("job %s payload: %w", kind, err)
	}
	err = r.s.queries(ctx).EnqueueJob(ctx, sqlcdb.EnqueueJobParams{Kind: kind, Payload: data, RunAt: runAt})
	return mapError(err, "job", 0)
}

// Claim takes up to limit due jobs for this worker, oldest run_at first.
func (r *JobRepo) Claim(ctx context.Context, now time.Time, limit int) ([]jobs.Job, error) {
	rows, err := r.s.queries(ctx).ClaimJobs(ctx, sqlcdb.ClaimJobsParams{Now: now, MaxJobs: int32(limit)})
	if err != nil {
		return nil, mapError(err, "jobs", 0)
	}
	// UPDATE ... RETURNING does not keep the subquery's order, so sort again.
	slices.SortFunc(rows, func(a, b sqlcdb.Job) int {
		return cmp.Or(a.RunAt.Compare(b.RunAt), cmp.Compare(a.ID, b.ID))
	})
	out := make([]jobs.Job, len(rows))
	for i, row := range rows {
		out[i] = jobs.Job{
			ID:          row.ID,
			Kind:        row.Kind,
			Payload:     row.Payload,
			Attempts:    int(row.Attempts),
			MaxAttempts: int(row.MaxAttempts),
		}
	}
	return out, nil
}

// Complete marks a job done.
func (r *JobRepo) Complete(ctx context.Context, id int64) error {
	return mapError(r.s.queries(ctx).CompleteJob(ctx, id), "job", id)
}

// Retry puts a failed job back in the queue until runAt.
func (r *JobRepo) Retry(ctx context.Context, id int64, runAt time.Time, lastErr string) error {
	err := r.s.queries(ctx).RetryJob(ctx, sqlcdb.RetryJobParams{ID: id, RunAt: runAt, LastError: lastErr})
	return mapError(err, "job", id)
}

// Kill marks a job dead after its last attempt failed.
func (r *JobRepo) Kill(ctx context.Context, id int64, lastErr string) error {
	err := r.s.queries(ctx).KillJob(ctx, sqlcdb.KillJobParams{ID: id, LastError: lastErr})
	return mapError(err, "job", id)
}

// Task returns a task for a job handler, without any policy check: jobs act for the
// system, not for a user.
func (r *JobRepo) Task(ctx context.Context, id int64) (domain.Task, error) {
	return NewTaskRepo(r.s).Get(ctx, id)
}

// Watchers returns a task's watchers for a job handler.
func (r *JobRepo) Watchers(ctx context.Context, taskID int64) ([]domain.UserRef, error) {
	return NewWatcherRepo(r.s).List(ctx, taskID)
}

// Notify writes a notification for a user.
func (r *JobRepo) Notify(ctx context.Context, userID int64, kind string, payload any, at time.Time) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("notification %s payload: %w", kind, err)
	}
	err = r.s.queries(ctx).CreateNotification(ctx, sqlcdb.CreateNotificationParams{
		UserID:    userID,
		Kind:      kind,
		Payload:   data,
		CreatedAt: at,
	})
	return mapError(err, "notification", 0)
}
