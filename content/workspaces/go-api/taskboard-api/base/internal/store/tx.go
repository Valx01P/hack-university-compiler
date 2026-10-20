package store

import (
	"context"
	"errors"
	"fmt"
	"math/rand/v2"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type txKey struct{}

// txAttempts is how many times InTx tries a transaction PostgreSQL asks to retry.
const txAttempts = 3

// InTx runs fn in a transaction: Begin, then fn with a ctx that carries the
// transaction, then Commit, or Rollback when fn returns an error. When PostgreSQL
// gives up on the transaction because of a serialization failure (40001) or a deadlock
// (40P01), InTx runs it again from the start, up to 3 times, after a short random
// pause. Called with a ctx that already carries a transaction, fn joins it.
func (s *Store) InTx(ctx context.Context, fn func(ctx context.Context) error) error {
	if _, ok := ctx.Value(txKey{}).(pgx.Tx); ok {
		return fn(ctx)
	}
	var err error
	for attempt := 1; attempt <= txAttempts; attempt++ {
		err = s.inTx(ctx, fn)
		if !retryable(err) || attempt == txAttempts {
			return err
		}
		pause := time.Duration(attempt*10+rand.IntN(20)) * time.Millisecond //nolint:gosec // jitter needs no cryptographic randomness
		select {
		case <-ctx.Done():
			return err
		case <-time.After(pause):
		}
	}
	return err
}

func (s *Store) inTx(ctx context.Context, fn func(ctx context.Context) error) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin: %w", err)
	}
	// Rollback is a no-op once Commit has succeeded. It gets a context that cannot be
	// canceled, so a client hanging up never leaves a transaction open.
	defer func() { _ = tx.Rollback(context.WithoutCancel(ctx)) }()
	if err := fn(context.WithValue(ctx, txKey{}, tx)); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}

// retryable reports whether err means PostgreSQL rolled the transaction back and
// running it again may succeed.
func retryable(err error) bool {
	pgErr, ok := errors.AsType[*pgconn.PgError](err)
	return ok && (pgErr.Code == "40001" || pgErr.Code == "40P01")
}
