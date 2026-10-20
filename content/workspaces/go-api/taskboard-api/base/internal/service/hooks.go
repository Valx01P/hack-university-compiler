package service

import (
	"context"
	"strings"

	"example.com/taskboard/internal/domain"
)

// Hooks are rules that run around every task write, whichever service method makes
// it. run.go registers them at startup, and each list runs in the order it was built.
// A hook that returns an error stops the write before anything reaches the database.
//
// Three kinds of hook guard a task, from the inside out:
//
//   - the model's own BeforeCreate and BeforeUpdate (domain/task.go), which the store
//     runs on every write, for rules that are part of what a task is;
//   - these registries, for app-wide rules that are not the model's business;
//   - the set_updated_at trigger (db/migrations/00005_updated_at.sql), which even a
//     psql UPDATE cannot skip.
type Hooks struct {
	BeforeCreateTask []func(ctx context.Context, t *domain.Task) error
	BeforeUpdateTask []func(ctx context.Context, t *domain.Task) error
}

func (h *Hooks) beforeCreateTask(ctx context.Context, t *domain.Task) error {
	for _, hook := range h.BeforeCreateTask {
		if err := hook(ctx, t); err != nil {
			return err
		}
	}
	return nil
}

func (h *Hooks) beforeUpdateTask(ctx context.Context, t *domain.Task) error {
	for _, hook := range h.BeforeUpdateTask {
		if err := hook(ctx, t); err != nil {
			return err
		}
	}
	return nil
}

// TidyTitle is a hook that collapses runs of spaces inside a task's title, so
// "Fix   login" and "Fix login" are the same title. run.go registers it for creates
// and updates.
func TidyTitle(ctx context.Context, t *domain.Task) error {
	t.Title = strings.Join(strings.Fields(t.Title), " ")
	return nil
}

type afterCommitKey struct{}

// afterCommit is one transaction's queue of work to do once it has committed.
type afterCommit struct {
	fns []func(context.Context)
}

// AfterCommit queues fn to run after the transaction in ctx commits, and drops it if
// the transaction rolls back, so an email or a cache update never happens for a change
// that was never saved. Outside a transaction, fn runs at once.
func AfterCommit(ctx context.Context, fn func(context.Context)) {
	if q, ok := ctx.Value(afterCommitKey{}).(*afterCommit); ok {
		q.fns = append(q.fns, fn)
		return
	}
	fn(ctx)
}

// inTx runs fn in one transaction, then the work fn queued with AfterCommit. Each
// attempt gets a fresh queue, so a transaction PostgreSQL retries never runs a hook
// twice. The hooks get a context that a client hanging up cannot cancel, because the
// change they follow is already saved.
func inTx(ctx context.Context, tx TxRunner, fn func(ctx context.Context) error) error {
	var queue *afterCommit
	err := tx.InTx(ctx, func(ctx context.Context) error {
		queue = &afterCommit{}
		return fn(context.WithValue(ctx, afterCommitKey{}, queue))
	})
	if err != nil {
		return err
	}
	after := context.WithoutCancel(ctx)
	for _, fn := range queue.fns {
		fn(after)
	}
	return nil
}
