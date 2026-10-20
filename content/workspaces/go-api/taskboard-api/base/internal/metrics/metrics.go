// Package metrics keeps the server's counters with expvar, which the admin server
// publishes as JSON at /debug/vars: requests by route and status, a latency histogram,
// and how many requests are in flight. It also counts each request's database
// queries, which development mode reports in the X-Query-Count header.
package metrics

import (
	"context"
	"expvar"
	"strconv"
	"sync/atomic"
	"time"
)

var (
	requests = expvar.NewMap("requests") // "GET /v1/projects 200": 3
	latency  = expvar.NewMap("latency")  // le_10ms, le_100ms, le_1s, gt_1s
	inFlight = expvar.NewInt("in_flight")
)

// Begin counts a request as in flight, and returns the function that counts it done.
func Begin() (end func()) {
	inFlight.Add(1)
	return func() { inFlight.Add(-1) }
}

// Observe records one finished request. pattern is the route that served it (the
// ServeMux's r.Pattern), or "" when no route matched.
func Observe(pattern string, status int, took time.Duration) {
	if pattern == "" {
		pattern = "unmatched"
	}
	requests.Add(pattern+" "+strconv.Itoa(status), 1)
	latency.Add(bucket(took), 1)
}

// bucket names the latency bucket a duration falls in. Buckets are cumulative-free:
// each request counts in exactly one.
func bucket(d time.Duration) string {
	switch {
	case d <= 10*time.Millisecond:
		return "le_10ms"
	case d <= 100*time.Millisecond:
		return "le_100ms"
	case d <= time.Second:
		return "le_1s"
	}
	return "gt_1s"
}

type queryCountKey struct{}

// WithQueryCount returns a copy of ctx that counts the queries run with it.
func WithQueryCount(ctx context.Context) context.Context {
	return context.WithValue(ctx, queryCountKey{}, new(atomic.Int64))
}

// CountQuery adds one query to ctx's count, when it has one. The store's tracer calls
// it for every query.
func CountQuery(ctx context.Context) {
	if n, ok := ctx.Value(queryCountKey{}).(*atomic.Int64); ok {
		n.Add(1)
	}
}

// QueryCount returns how many queries ran with ctx so far.
func QueryCount(ctx context.Context) int64 {
	if n, ok := ctx.Value(queryCountKey{}).(*atomic.Int64); ok {
		return n.Load()
	}
	return 0
}
