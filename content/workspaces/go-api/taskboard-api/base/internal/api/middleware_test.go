package api

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCORS(t *testing.T) {
	a := newTestAPI(t)
	t.Run("a preflight from a listed origin", func(t *testing.T) {
		rec := a.do(t, "OPTIONS", "/v1/projects", "", "",
			"Origin", "http://localhost:20013",
			"Access-Control-Request-Method", "PATCH",
			"Access-Control-Request-Headers", "content-type, authorization, if-match")
		wantStatus(t, rec, http.StatusNoContent)
		h := rec.Header()
		if h.Get("Access-Control-Allow-Origin") != "http://localhost:20013" || h.Get("Access-Control-Allow-Credentials") != "true" {
			t.Errorf("headers %v", h)
		}
		if !strings.Contains(h.Get("Access-Control-Allow-Methods"), "PATCH") || !strings.Contains(h.Get("Access-Control-Allow-Headers"), "If-Match") {
			t.Errorf("headers %v", h)
		}
	})
	t.Run("a request from a listed origin can read ETag", func(t *testing.T) {
		rec := a.do(t, "GET", "/v1/tasks/1", a.as(graceID), "", "Origin", "http://localhost:20013")
		h := rec.Header()
		if h.Get("Access-Control-Allow-Origin") != "http://localhost:20013" || !strings.Contains(h.Get("Access-Control-Expose-Headers"), "ETag") {
			t.Errorf("headers %v", h)
		}
		if !strings.Contains(strings.Join(h.Values("Vary"), ","), "Origin") {
			t.Errorf("Vary = %v", h.Values("Vary"))
		}
	})
	t.Run("an unlisted origin gets no CORS headers", func(t *testing.T) {
		rec := a.do(t, "GET", "/v1/me", a.as(graceID), "", "Origin", "http://localhost:20999")
		if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
			t.Errorf("Access-Control-Allow-Origin = %q", got)
		}
	})
}

func TestCrossSiteWritesAreRefused(t *testing.T) {
	a := newTestAPI(t)
	cookie := "tb_session=" + a.as(graceID)
	rec := a.do(t, "POST", "/v1/projects", "", `{"name": "Evil"}`, "Cookie", cookie, "Sec-Fetch-Site", "cross-site", "Origin", "https://evil.example")
	wantStatus(t, rec, http.StatusForbidden)
	rec = a.do(t, "POST", "/v1/projects", "", `{"name": "Friendly"}`, "Cookie", cookie, "Sec-Fetch-Site", "same-site", "Origin", "http://localhost:20013")
	wantStatus(t, rec, http.StatusCreated)
}

func TestRequestID(t *testing.T) {
	a := newTestAPI(t)
	if got := a.do(t, "GET", "/healthz", "", "", "X-Request-ID", "abc-123").Header().Get("X-Request-ID"); got != "abc-123" {
		t.Errorf("a valid id was not echoed: %q", got)
	}
	if got := a.do(t, "GET", "/healthz", "", "", "X-Request-ID", "bad id\twith tabs").Header().Get("X-Request-ID"); got == "" || strings.Contains(got, " ") {
		t.Errorf("an invalid id was not replaced: %q", got)
	}
}

func TestRecoverPanics(t *testing.T) {
	s := &server{Deps: Deps{Log: slog.New(slog.NewTextHandler(io.Discard, nil))}}
	h := s.recoverPanics(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { panic("boom") }))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/v1/tasks/1", nil))
	wantStatus(t, rec, http.StatusInternalServerError)
	if p := decode[problem](t, rec); strings.Contains(p.Detail, "boom") {
		t.Errorf("a 500's detail leaks the cause: %q", p.Detail)
	}
}

func TestUnmatchedRoutesAreProblems(t *testing.T) {
	a := newTestAPI(t)
	rec := a.do(t, "GET", "/v2/projects", "", "")
	wantStatus(t, rec, http.StatusNotFound)
	if rec.Header().Get("Content-Type") != "application/problem+json" {
		t.Errorf("Content-Type = %s", rec.Header().Get("Content-Type"))
	}
	rec = a.do(t, "DELETE", "/v1/me", a.as(graceID), "")
	wantStatus(t, rec, http.StatusMethodNotAllowed)
	if !strings.Contains(rec.Header().Get("Allow"), "GET") {
		t.Errorf("Allow = %q", rec.Header().Get("Allow"))
	}
}

func TestHealth(t *testing.T) {
	a := newTestAPI(t)
	if rec := a.do(t, "GET", "/healthz", "", ""); rec.Code != 200 || strings.TrimSpace(rec.Body.String()) != `{"status":"ok"}` {
		t.Errorf("healthz = %d %s", rec.Code, rec.Body)
	}
	if rec := a.do(t, "GET", "/readyz", "", ""); rec.Code != 200 || !strings.Contains(rec.Body.String(), `"db":"ok"`) {
		t.Errorf("readyz = %d %s", rec.Code, rec.Body)
	}
}
