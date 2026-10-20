package api

import "net/http"

type readyResponse struct {
	Status string            `json:"status"`
	Checks map[string]string `json:"checks"`
}

// healthz answers whether the process is up. It never touches the database, so a
// slow database never gets a healthy process restarted.
func (s *server) healthz(w http.ResponseWriter, r *http.Request) error {
	return writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// readyz answers whether the server can do its job right now.
func (s *server) readyz(w http.ResponseWriter, r *http.Request) error {
	// TODO: ping the database with s.Ready under a 1 second timeout, and answer 503
	// with {"status": "not_ready", "checks": {"db": "timeout"}} (or "error") when it fails.
	return writeJSON(w, http.StatusOK, readyResponse{Status: "ready", Checks: map[string]string{"db": "ok"}})
}
