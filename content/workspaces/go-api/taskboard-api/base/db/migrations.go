// Package db is the database's schema history: the goose migrations in migrations/,
// embedded into the binary so the server can bring any database up to date when it
// starts (MIGRATE_ON_START=true), with no files to ship next to it.
package db

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"log/slog"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/pressly/goose/v3/lock"
)

//go:embed migrations/*.sql
var embedded embed.FS

// Migrations is the migrations folder as the root of a file system, the way
// goose.NewProvider expects it.
var Migrations = mustSub(embedded, "migrations")

func mustSub(fsys fs.FS, dir string) fs.FS {
	sub, err := fs.Sub(fsys, dir)
	if err != nil {
		panic(err)
	}
	return sub
}

// Migrate applies every pending migration to the database behind pool, logging each
// one with how long it took, and returns how many it applied. Each migration runs in
// its own transaction, so one that fails leaves the database as it was before it, and
// a session lock keeps two servers starting at once from migrating together.
func Migrate(ctx context.Context, pool *pgxpool.Pool, log *slog.Logger) (int, error) {
	sqlDB := stdlib.OpenDBFromPool(pool)
	defer sqlDB.Close()
	locker, err := lock.NewPostgresSessionLocker()
	if err != nil {
		return 0, fmt.Errorf("migration lock: %w", err)
	}
	provider, err := goose.NewProvider(goose.DialectPostgres, sqlDB, Migrations, goose.WithSessionLocker(locker))
	if err != nil {
		return 0, fmt.Errorf("read migrations: %w", err)
	}
	results, err := provider.Up(ctx)
	for _, r := range results {
		log.Info("migration applied", "version", r.Source.Version, "file", r.Source.Path, "duration_ms", r.Duration.Milliseconds())
	}
	if err != nil {
		return len(results), fmt.Errorf("migrate: %w", err)
	}
	return len(results), nil
}
