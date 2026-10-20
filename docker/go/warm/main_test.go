package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/synctest"
)

func TestWarm(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		rec := httptest.NewRecorder()
		http.NotFound(rec, httptest.NewRequest("GET", "/", nil))
		if rec.Code != http.StatusNotFound {
			t.Fatal(rec.Code)
		}
	})
}
