package api

import (
	"context"
	"fmt"
	"log/slog"
	"math"
	"net"
	"net/http"
	"runtime/debug"
	"strconv"
	"strings"
	"sync"
	"time"
	"uuid"

	"golang.org/x/time/rate"

	"example.com/taskboard/internal/auth"
	"example.com/taskboard/internal/domain"
	"example.com/taskboard/internal/metrics"
)

// A middleware takes a handler and returns one that does something before or after
// it. NewServer lists the chain in order.

// statusRecorder remembers the status and size of a response as it is written.
type statusRecorder struct {
	http.ResponseWriter
	code  int
	bytes int64
}

func (rec *statusRecorder) WriteHeader(code int) {
	if rec.code == 0 {
		rec.code = code
	}
	rec.ResponseWriter.WriteHeader(code)
}

func (rec *statusRecorder) Write(b []byte) (int, error) {
	if rec.code == 0 {
		rec.code = http.StatusOK
	}
	n, err := rec.ResponseWriter.Write(b)
	rec.bytes += int64(n)
	return n, err
}

// Unwrap lets http.ResponseController reach the real writer, for Flush and deadlines.
func (rec *statusRecorder) Unwrap() http.ResponseWriter { return rec.ResponseWriter }

func (rec *statusRecorder) status() int {
	if rec.code == 0 {
		return http.StatusOK
	}
	return rec.code
}

func (rec *statusRecorder) written() bool { return rec.code != 0 }

type requestIDKey struct{}

// requestID gives every request an id: the caller's X-Request-ID when it is a sane
// one, so a request can be followed across services, or a new UUIDv7. The id goes back
// in the response header, into every log line, and into problem bodies.
func requestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get("X-Request-ID")
		if !validRequestID(id) {
			id = uuid.NewV7().String()
		}
		w.Header().Set("X-Request-ID", id)
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), requestIDKey{}, id)))
	})
}

func validRequestID(id string) bool {
	if id == "" || len(id) > 64 {
		return false
	}
	for _, c := range id {
		letter := c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z'
		digit := c >= '0' && c <= '9'
		if !letter && !digit && c != '-' && c != '_' && c != '.' {
			return false
		}
	}
	return true
}

func requestIDFrom(ctx context.Context) string {
	id, _ := ctx.Value(requestIDKey{}).(string)
	return id
}

// countQueries counts the database queries each request runs (the store's tracer adds
// to the count). With header set, as in development, the count goes back as
// X-Query-Count, the quickest way to spot an N+1 query.
func countQueries(header bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := metrics.WithQueryCount(r.Context())
			if header {
				w = &queryCountWriter{ResponseWriter: w, ctx: ctx}
			}
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// queryCountWriter adds X-Query-Count just before the headers go out, when every query
// of the request has run.
type queryCountWriter struct {
	http.ResponseWriter
	ctx   context.Context
	wrote bool
}

func (w *queryCountWriter) WriteHeader(code int) {
	if !w.wrote {
		w.wrote = true
		w.Header().Set("X-Query-Count", strconv.FormatInt(metrics.QueryCount(w.ctx), 10))
	}
	w.ResponseWriter.WriteHeader(code)
}

func (w *queryCountWriter) Write(b []byte) (int, error) {
	if !w.wrote {
		w.WriteHeader(http.StatusOK)
	}
	return w.ResponseWriter.Write(b)
}

func (w *queryCountWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

// logRequests writes one log line per request: method, path, the route pattern that
// matched (r.Pattern, set by the ServeMux), status, size, queries, and duration. It
// never logs bodies, which can hold passwords.
func (s *server) logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w}
		next.ServeHTTP(rec, r)
		level := slog.LevelInfo
		if rec.status() >= http.StatusInternalServerError {
			level = slog.LevelError
		}
		s.Log.LogAttrs(r.Context(), level, "request",
			slog.String("request_id", requestIDFrom(r.Context())),
			slog.String("method", r.Method),
			slog.String("path", r.URL.Path),
			slog.String("pattern", r.Pattern),
			slog.Int("status", rec.status()),
			slog.Int64("bytes", rec.bytes),
			slog.Int64("queries", metrics.QueryCount(r.Context())),
			slog.Float64("duration_ms", math.Round(float64(time.Since(start).Microseconds()))/1000),
		)
	})
}

// recoverPanics turns a panic in a handler into a logged 500 problem, so one bad
// request cannot take the whole server down.
func (s *server) recoverPanics(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			v := recover()
			if v == nil {
				return
			}
			if v == http.ErrAbortHandler {
				panic(v) // the server's own way to abort a response: let it through
			}
			s.Log.ErrorContext(r.Context(), "panic", "request_id", requestIDFrom(r.Context()),
				"panic", fmt.Sprint(v), "stack", string(debug.Stack()))
			if rec, ok := w.(interface{ written() bool }); ok && rec.written() {
				return // too late for a problem: the headers are gone
			}
			s.writeProblem(w, r, fmt.Errorf("panic: %v", v))
		}()
		next.ServeHTTP(w, r)
	})
}

// secureHeaders sets headers every API response should have: no MIME sniffing, no
// Referer leaking URLs elsewhere, and no caching of anything under /v1, which is
// private to whoever is logged in.
func secureHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "no-referrer")
		if strings.HasPrefix(r.URL.Path, "/v1/") {
			h.Set("Cache-Control", "no-store")
		}
		next.ServeHTTP(w, r)
	})
}

// cors lets pages from the origins in CORS_ORIGINS (such as the React course's client
// on another port) call this API from a browser, with cookies. A preflight from such
// an origin is answered here. Any other origin gets no CORS headers, so the browser
// keeps the response from the page.
func (s *server) cors(next http.Handler) http.Handler {
	allowed := make(map[string]bool, len(s.CORSOrigins))
	for _, o := range s.CORSOrigins {
		allowed[o] = true
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin == "" {
			next.ServeHTTP(w, r)
			return
		}
		h := w.Header()
		h.Add("Vary", "Origin")
		preflight := r.Method == http.MethodOptions && r.Header.Get("Access-Control-Request-Method") != ""
		if allowed[origin] {
			h.Set("Access-Control-Allow-Origin", origin)
			h.Set("Access-Control-Allow-Credentials", "true")
			h.Set("Access-Control-Expose-Headers", "ETag, Location, Retry-After, X-Request-ID")
			if preflight {
				h.Add("Vary", "Access-Control-Request-Method")
				h.Add("Vary", "Access-Control-Request-Headers")
				h.Set("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE")
				h.Set("Access-Control-Allow-Headers", "Authorization, Content-Type, If-Match")
				h.Set("Access-Control-Max-Age", "600")
			}
		}
		if preflight {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// crossOrigin is CSRF protection for cookie logins: http.CrossOriginProtection
// refuses a write (POST, PUT, PATCH, DELETE) that a browser marks as coming from
// another site, unless that site is in CORS_ORIGINS. Clients that are not browsers
// send neither Sec-Fetch-Site nor Origin, and pass.
func (s *server) crossOrigin(next http.Handler) http.Handler {
	p := http.NewCrossOriginProtection()
	for _, o := range s.CORSOrigins {
		if err := p.AddTrustedOrigin(o); err != nil {
			s.Log.Error("CORS_ORIGINS entry ignored", "origin", o, "err", err)
		}
	}
	p.SetDenyHandler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s.writeProblem(w, r, fmt.Errorf("%w: a cross-site request cannot change data here", domain.ErrForbidden))
	}))
	return p.Handler(next)
}

// sessionCookie is the cookie that carries the login token for browsers.
const sessionCookie = "tb_session"

// requireAuth lets a request through only with a valid token, and puts its user in
// the context for the handlers (auth.UserFrom). The token comes from
// "Authorization: Bearer <token>", or, when there is no Authorization header, the
// tb_session cookie. A header that is present decides alone, so a bad bearer token is
// refused even next to a good cookie.
func (s *server) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token, err := credentials(r)
		if err != nil {
			s.writeProblem(w, r, err)
			return
		}
		user, err := s.Auth.Authenticate(r.Context(), token)
		if err != nil {
			s.writeProblem(w, r, err)
			return
		}
		next.ServeHTTP(w, r.WithContext(auth.WithUser(r.Context(), user)))
	})
}

// credentials returns the token a request carries.
func credentials(r *http.Request) (string, error) {
	if h := r.Header.Get("Authorization"); h != "" {
		scheme, token, ok := strings.Cut(h, " ")
		token = strings.TrimSpace(token)
		if !ok || !strings.EqualFold(scheme, "Bearer") || token == "" {
			return "", fmt.Errorf("%w: send Authorization: Bearer <token>", domain.ErrUnauthenticated)
		}
		return token, nil
	}
	if c, err := r.Cookie(sessionCookie); err == nil && c.Value != "" {
		return c.Value, nil
	}
	return "", fmt.Errorf("%w: log in to continue", domain.ErrUnauthenticated)
}

// limitLogins allows each client 5 login attempts, then one more every 12 seconds: a
// token bucket per client IP. Past the limit the answer is 429 with Retry-After, which
// makes guessing passwords slow. It uses real time, not the app's clock, since
// HU_FIXED_TIME would never refill a bucket.
func (s *server) limitLogins(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ok, wait := s.logins.allow(s.clientIP(r), time.Now())
		if !ok {
			s.writeProblem(w, r, &requestError{
				status:     http.StatusTooManyRequests,
				detail:     "too many login attempts: try again later",
				retryAfter: int(math.Ceil(wait.Seconds())),
			})
			return
		}
		next.ServeHTTP(w, r)
	})
}

// limiter keeps one token bucket per client, and forgets clients idle for a while.
type limiter struct {
	every time.Duration
	burst int

	mu        sync.Mutex
	clients   map[string]*client
	lastSweep time.Time
}

type client struct {
	bucket *rate.Limiter
	seen   time.Time
}

func newLimiter(every time.Duration, burst int) *limiter {
	return &limiter{every: every, burst: burst, clients: make(map[string]*client)}
}

// allow takes a token from key's bucket, or says how long until one is free.
func (l *limiter) allow(key string, now time.Time) (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if now.Sub(l.lastSweep) > time.Minute {
		for k, c := range l.clients {
			if now.Sub(c.seen) > 3*time.Minute {
				delete(l.clients, k)
			}
		}
		l.lastSweep = now
	}
	c, ok := l.clients[key]
	if !ok {
		c = &client{bucket: rate.NewLimiter(rate.Every(l.every), l.burst)}
		l.clients[key] = c
	}
	c.seen = now
	if c.bucket.AllowN(now, 1) {
		return true, 0
	}
	res := c.bucket.ReserveN(now, 1)
	wait := res.DelayFrom(now)
	res.CancelAt(now)
	return false, wait
}

// clientIP is the address a request came from. X-Forwarded-For is believed only when
// the request arrives from TRUSTED_PROXY, because any client can send that header;
// then the client is the last address the proxy added.
func (s *server) clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	if s.TrustedProxy == nil || !net.ParseIP(host).Equal(s.TrustedProxy) {
		return host
	}
	hops := strings.Split(r.Header.Get("X-Forwarded-For"), ",")
	if ip := net.ParseIP(strings.TrimSpace(hops[len(hops)-1])); ip != nil {
		return ip.String()
	}
	return host
}
