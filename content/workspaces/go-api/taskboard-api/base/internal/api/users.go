package api

import (
	"net/http"
	"unicode/utf8"
)

// searchUsers finds people by name or email: GET /v1/users?q=gr.
func (s *server) searchUsers(w http.ResponseWriter, r *http.Request) error {
	q := r.URL.Query().Get("q")
	if utf8.RuneCountInString(q) > 100 {
		return badRequest("q", "must be at most 100 characters")
	}
	users, err := s.Users.Search(r.Context(), user(r), q)
	if err != nil {
		return err
	}
	out := make([]userSummary, len(users))
	for i, u := range users {
		out[i] = userSummary{ID: u.ID, Name: u.Name, Email: u.Email}
	}
	return writeJSON(w, http.StatusOK, out)
}
