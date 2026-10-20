package api

import (
	"net/http"
	"strings"
	"testing"
)

func TestCredentials(t *testing.T) {
	a := newTestAPI(t)
	grace, linus := a.as(graceID), a.as(linusID)
	tests := []struct {
		name    string
		headers []string
		want    int
		wantID  int64
	}{
		{"no credentials", nil, 401, 0},
		{"a bearer token", []string{"Authorization", "Bearer " + grace}, 200, graceID},
		{"the cookie alone", []string{"Cookie", "tb_session=" + grace}, 200, graceID},
		{"the header wins over the cookie", []string{"Authorization", "Bearer " + linus, "Cookie", "tb_session=" + grace}, 200, linusID},
		{"a bad bearer token loses next to a good cookie", []string{"Authorization", "Bearer nope", "Cookie", "tb_session=" + grace}, 401, 0},
		{"another scheme", []string{"Authorization", "Basic Z3JhY2U6cGFzcw=="}, 401, 0},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			rec := a.do(t, "GET", "/v1/me", "", "", tc.headers...)
			wantStatus(t, rec, tc.want)
			if tc.want == 401 && !strings.HasPrefix(rec.Header().Get("WWW-Authenticate"), "Bearer") {
				t.Errorf("WWW-Authenticate = %q", rec.Header().Get("WWW-Authenticate"))
			}
			if tc.wantID != 0 && decode[userResponse](t, rec).ID != tc.wantID {
				t.Errorf("me is not user %d: %s", tc.wantID, rec.Body)
			}
		})
	}
}

func TestSignup(t *testing.T) {
	a := newTestAPI(t)
	rec := a.do(t, "POST", "/v1/auth/signup", "", `{"email": "  Katherine@Example.COM ", "name": "Katherine Johnson", "password": "hidden figures 1962"}`)
	wantStatus(t, rec, http.StatusCreated)
	if u := decode[userResponse](t, rec); u.Email != "katherine@example.com" || u.Role != "member" || u.ID != 5 {
		t.Errorf("signed up %+v", u)
	}
	if strings.Contains(rec.Body.String(), "password") {
		t.Errorf("the response mentions the password: %s", rec.Body)
	}
	tests := []struct {
		body   string
		status int
		field  string
	}{
		{`{"email": "KATHERINE@example.com", "name": "Kate", "password": "another long password"}`, 409, "email"},
		{`{"email": "dorothy@example.com", "name": "Dorothy", "password": "short pass1"}`, 422, "password"},
		{`{"email": "dorothy@example.com", "name": "Dorothy", "password": "` + strings.Repeat("x", 73) + `"}`, 422, "password"},
		{`{"email": "dorothy.example.com", "name": "Dorothy", "password": "hidden figures 1962"}`, 422, "email"},
		{`{"email": "dorothy@example.com", "password": "hidden figures 1962"}`, 422, "name"},
		{`{"email": "dorothy@example.com", "name": "Dorothy", "password": "hidden figures 1962", "role": "admin"}`, 400, "role"},
	}
	for _, tc := range tests {
		rec := a.do(t, "POST", "/v1/auth/signup", "", tc.body)
		if rec.Code != tc.status || decode[problem](t, rec).Errors[tc.field] == "" {
			t.Errorf("signup %s = %d %s, want %d with errors.%s", tc.body, rec.Code, rec.Body, tc.status, tc.field)
		}
	}
}
