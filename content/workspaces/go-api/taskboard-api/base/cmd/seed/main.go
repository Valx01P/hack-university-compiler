// Command seed loads a SQL seed file into the database at DATABASE_URL:
//
//	go run ./cmd/seed                          # db/seed.sql, the Taskboard contract's rows
//	go run ./cmd/seed -file db/seed_perf.sql   # 5,000 more tasks and 50,000 comments
//
// The seed files insert rows with fixed ids and ON CONFLICT DO NOTHING inside one
// transaction, so loading one twice changes nothing.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"

	"github.com/jackc/pgx/v5"
)

func main() {
	file := flag.String("file", "db/seed.sql", "the SQL file to load")
	flag.Parse()
	if err := seed(context.Background(), os.Getenv("DATABASE_URL"), *file, os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, "seed:", err)
		os.Exit(1)
	}
}

// seed runs the SQL in file, then prints how many rows each table holds.
func seed(ctx context.Context, url, file string, out io.Writer) error {
	if url == "" {
		return errors.New("DATABASE_URL is not set")
	}
	sql, err := os.ReadFile(file) //nolint:gosec // the seed file is whichever one the developer names
	if err != nil {
		return err
	}
	conn, err := pgx.Connect(ctx, url)
	if err != nil {
		return err
	}
	defer func() { _ = conn.Close(ctx) }()
	// With no arguments, Exec sends the text as one simple-protocol query, which may
	// hold many statements.
	if _, err := conn.Exec(ctx, string(sql)); err != nil {
		return fmt.Errorf("%s: %w", file, err)
	}
	var users, projects, tasks, comments, watchers int
	err = conn.QueryRow(ctx, `SELECT
		(SELECT count(*) FROM users), (SELECT count(*) FROM projects), (SELECT count(*) FROM tasks),
		(SELECT count(*) FROM comments), (SELECT count(*) FROM task_watchers)`).
		Scan(&users, &projects, &tasks, &comments, &watchers)
	if err != nil {
		return err
	}
	_, err = fmt.Fprintf(out, "loaded %s: %d users, %d projects, %d tasks, %d comments, %d watchers\n",
		file, users, projects, tasks, comments, watchers)
	return err
}
