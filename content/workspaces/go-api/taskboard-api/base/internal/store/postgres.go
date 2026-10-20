// Package store is the repository layer: the only code that knows SQL and pgx. Each
// repository turns domain types into sqlc parameters, runs a generated query from
// sqlcdb, and turns the rows and errors that come back into domain types and domain
// errors. The services above see none of it.
package store

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"example.com/taskboard/internal/store/sqlcdb"
)

// NewPool connects to the database at url with a pool of connections, traced by
// tracer (nil for none), and checks it answers within 2 seconds, so a wrong
// DATABASE_URL stops the server at startup instead of failing the first request.
func NewPool(ctx context.Context, url string, tracer pgx.QueryTracer) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, fmt.Errorf("parse DATABASE_URL: %w", err)
	}
	cfg.ConnConfig.Tracer = tracer
	cfg.MaxConnIdleTime = 5 * time.Minute
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("create pool: %w", err)
	}
	pingCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("connect to the database: %w", err)
	}
	return pool, nil
}

// Store is the pool and the generated queries, shared by every repository.
type Store struct {
	pool *pgxpool.Pool
	q    *sqlcdb.Queries
}

// New returns a Store over pool.
func New(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool, q: sqlcdb.New(pool)}
}

// Ping checks the database answers, for /readyz.
func (s *Store) Ping(ctx context.Context) error { return s.pool.Ping(ctx) }

// queries returns the generated queries bound to the transaction InTx put in ctx, or
// to the pool outside a transaction. Every repository method starts with it, which is
// how a service's calls inside InTx all join one transaction.
func (s *Store) queries(ctx context.Context) *sqlcdb.Queries {
	if tx, ok := ctx.Value(txKey{}).(pgx.Tx); ok {
		return s.q.WithTx(tx)
	}
	return s.q
}

// mapErr converts every row with convert and stops at the first error: the Map of
// lesson 5, for conversions that can fail.
func mapErr[R, T any](rows []R, convert func(R) (T, error)) ([]T, error) {
	out := make([]T, 0, len(rows))
	for _, r := range rows {
		v, err := convert(r)
		if err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, nil
}
