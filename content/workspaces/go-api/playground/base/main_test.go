package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// A test to copy: it calls the routes in memory, with no server and no port.
func TestHello(t *testing.T) {
	tests := []struct {
		path, want string
	}{
		{"/hello", `{"message":"hello, world"}` + "\n"},
		{"/hello?name=Gopher", `{"message":"hello, Gopher"}` + "\n"},
	}
	for _, tc := range tests {
		rec := httptest.NewRecorder()
		routes().ServeHTTP(rec, httptest.NewRequest("GET", tc.path, nil))
		if rec.Code != http.StatusOK || rec.Body.String() != tc.want {
			t.Errorf("GET %s = %d %q, want 200 %q", tc.path, rec.Code, rec.Body, tc.want)
		}
	}
}
