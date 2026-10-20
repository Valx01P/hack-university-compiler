package api

import (
	"context"
	"errors"
	"net/http"
	"time"
)

type readyResponse struct {
	Status string            `json:"status"`
	Checks map[string]string `json:"checks"`
}

// healthz answers whether the process is up. It never touches the database, so a
// slow database never gets a healthy process restarted.
func (s *server) healthz(w http.ResponseWriter, r *http.Request) error {
	return writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// readyz answers whether the server can do its job right now: the database must
// answer a ping within a second. A load balancer sends traffic only while it says 200.
func (s *server) readyz(w http.ResponseWriter, r *http.Request) error {
	ctx, cancel := context.WithTimeout(r.Context(), time.Second)
	defer cancel()
	if err := s.Ready(ctx); err != nil {
		state := "error"
		if errors.Is(err, context.DeadlineExceeded) {
			state = "timeout"
		}
		s.Log.WarnContext(ctx, "not ready", "db", state, "err", err)
		return writeJSON(w, http.StatusServiceUnavailable, readyResponse{Status: "not_ready", Checks: map[string]string{"db": state}})
	}
	return writeJSON(w, http.StatusOK, readyResponse{Status: "ready", Checks: map[string]string{"db": "ok"}})
}
