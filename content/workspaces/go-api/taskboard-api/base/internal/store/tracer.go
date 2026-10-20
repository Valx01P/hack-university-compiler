package store

import (
	"context"
	"log/slog"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"example.com/taskboard/internal/metrics"
)

// Tracer is a pgx.QueryTracer: pgx calls it around every query. It counts each query
// for the request it belongs to, and logs a warning for any query slower than
// SLOW_QUERY_MS, named by its sqlc name.
type Tracer struct {
	log  *slog.Logger
	slow time.Duration
}

// NewTracer returns a Tracer that logs queries slower than slow (0 logs none).
func NewTracer(log *slog.Logger, slow time.Duration) *Tracer {
	return &Tracer{log: log, slow: slow}
}

type traceKey struct{}

type traceStart struct {
	at  time.Time
	sql string
}

// TraceQueryStart runs before a query. What it returns is the ctx pgx hands to
// TraceQueryEnd, which is how the start time gets there.
func (t *Tracer) TraceQueryStart(ctx context.Context, _ *pgx.Conn, data pgx.TraceQueryStartData) context.Context {
	metrics.CountQuery(ctx)
	return context.WithValue(ctx, traceKey{}, traceStart{at: time.Now(), sql: data.SQL})
}

// TraceQueryEnd runs after a query, with how it ended.
func (t *Tracer) TraceQueryEnd(ctx context.Context, _ *pgx.Conn, data pgx.TraceQueryEndData) {
	start, ok := ctx.Value(traceKey{}).(traceStart)
	if !ok || t.slow <= 0 {
		return
	}
	if took := time.Since(start.at); took >= t.slow {
		t.log.WarnContext(ctx, "slow query", "query", QueryName(start.sql), "duration_ms", took.Milliseconds(), "err", data.Err)
	}
}

// QueryName returns the name sqlc puts on the first line of every generated query,
// "-- name: ListComments :many", or "" for SQL without one.
func QueryName(sql string) string {
	line, _, _ := strings.Cut(strings.TrimSpace(sql), "\n")
	rest, ok := strings.CutPrefix(line, "-- name: ")
	if !ok {
		return ""
	}
	name, _, _ := strings.Cut(rest, " ")
	return name
}
