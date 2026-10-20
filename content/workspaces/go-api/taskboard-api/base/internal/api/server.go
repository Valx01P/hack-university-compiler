// Package api is the HTTP layer, the controllers and views of the MVC split for APIs.
// Handlers (tasks.go, projects.go, and the rest) read the request, call one service
// method, and write the response through a DTO (dto.go). Rules live in the services,
// SQL in the store, and every error becomes an RFC 9457 problem in problems.go.
package api

import (
	"context"
	"log/slog"
	"net"
	"net/http"
	"time"

	"example.com/taskboard/internal/auth"
	"example.com/taskboard/internal/domain"
	"example.com/taskboard/internal/service"
)

// Deps is everything the HTTP layer needs. run.go builds it over PostgreSQL, and
// tests build it over servicetest's fakes.
type Deps struct {
	Log         *slog.Logger
	Auth        *service.AuthService
	Users       *service.UserService
	Projects    *service.ProjectService
	Tasks       *service.TaskService
	Comments    *service.CommentService
	Watchers    *service.WatcherService
	Attachments *service.AttachmentService

	// Ready checks the dependencies /readyz reports on: the database.
	Ready func(ctx context.Context) error

	CORSOrigins  []string // origins a browser page may call the API from, with cookies
	TrustedProxy net.IP   // the proxy whose X-Forwarded-For is believed, or nil
	Development  bool     // adds X-Query-Count to every response
}

type server struct {
	Deps
	logins *limiter
}

// NewServer returns the whole API as one http.Handler: the routes of routes.go inside
// the middleware chain, listed here from the outside in.
func NewServer(deps Deps) http.Handler {
	s := &server{Deps: deps, logins: newLimiter(12*time.Second, 5)}
	mux := http.NewServeMux()
	s.routes(mux)

	h := s.unmatched(mux)
	h = s.crossOrigin(h)
	h = s.cors(h)
	h = secureHeaders(h)
	h = s.recoverPanics(h)
	h = measure(h)
	h = s.logRequests(h)
	h = countQueries(deps.Development)(h)
	h = requestID(h)
	return h
}

// apiFunc is a handler that returns its error instead of writing it, so every error
// is turned into a problem response in one place.
type apiFunc func(w http.ResponseWriter, r *http.Request) error

func (s *server) handle(h apiFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := h(w, r); err != nil {
			s.writeProblem(w, r, err)
		}
	})
}

// user is the logged-in user requireAuth put in the request's context.
func user(r *http.Request) domain.User {
	u, _ := auth.UserFrom(r.Context())
	return u
}

// unmatched answers requests that match no route with a problem body, instead of the
// ServeMux's plain-text "404 page not found" or 405. It asks the mux what it would
// say, keeping the 405's Allow header, and lets redirects through untouched.
func (s *server) unmatched(mux *http.ServeMux) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h, pattern := mux.Handler(r)
		if pattern != "" {
			mux.ServeHTTP(w, r)
			return
		}
		probe := &headerProbe{header: http.Header{}}
		h.ServeHTTP(probe, r)
		if probe.code >= 300 && probe.code < 400 {
			mux.ServeHTTP(w, r)
			return
		}
		detail := "no route matches " + r.Method + " " + r.URL.Path
		if allow := probe.header.Get("Allow"); allow != "" {
			w.Header().Set("Allow", allow)
			detail = r.URL.Path + " does not accept " + r.Method + ", only " + allow
		}
		s.writeProblem(w, r, &requestError{status: probe.code, detail: detail})
	})
}

// headerProbe is a ResponseWriter that keeps only the status and headers.
type headerProbe struct {
	header http.Header
	code   int
}

func (p *headerProbe) Header() http.Header         { return p.header }
func (p *headerProbe) Write(b []byte) (int, error) { return len(b), nil }
func (p *headerProbe) WriteHeader(code int)        { p.code = code }
