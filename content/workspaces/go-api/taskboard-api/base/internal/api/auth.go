package api

import (
	"net/http"

	"example.com/taskboard/internal/service"
)

// signup creates an account. It does not log the new user in.
func (s *server) signup(w http.ResponseWriter, r *http.Request) error {
	req, err := decodeJSON[signupRequest](w, r)
	if err != nil {
		return err
	}
	u, err := s.Auth.Signup(r.Context(), req.Email, req.Name, req.Password)
	if err != nil {
		return err
	}
	return writeJSON(w, http.StatusCreated, toUserResponse(u))
}

// login returns a token in the body for API clients, and sets the same token as the
// tb_session cookie for browsers: HttpOnly so page scripts cannot read it, and
// SameSite=Lax so other sites' forms cannot send it. It has Max-Age, never Expires,
// because a fixed development clock would put Expires in the past, and never Secure,
// because Safari drops Secure cookies on http://localhost.
func (s *server) login(w http.ResponseWriter, r *http.Request) error {
	req, err := decodeJSON[loginRequest](w, r)
	if err != nil {
		return err
	}
	l, err := s.Auth.Login(r.Context(), req.Email, req.Password)
	if err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{ //nolint:gosec // never Secure: Safari drops Secure cookies on http://localhost
		Name:     sessionCookie,
		Value:    l.Token,
		Path:     "/",
		MaxAge:   int(service.SessionTTL.Seconds()),
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
	return writeJSON(w, http.StatusOK, loginResponse{Token: l.Token, ExpiresAt: l.ExpiresAt.UTC(), User: toUserResponse(l.User)})
}

// logout ends the session that sent the request and clears the cookie.
func (s *server) logout(w http.ResponseWriter, r *http.Request) error {
	token, err := credentials(r)
	if err != nil {
		return err
	}
	if err := s.Auth.Logout(r.Context(), token); err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{ //nolint:gosec // the same cookie as login's, cleared
		Name:     sessionCookie,
		Value:    "",
		Path:     "/",
		MaxAge:   -1, // sent as Max-Age=0: delete it now
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// me returns the logged-in user.
func (s *server) me(w http.ResponseWriter, r *http.Request) error {
	return writeJSON(w, http.StatusOK, toUserResponse(user(r)))
}
