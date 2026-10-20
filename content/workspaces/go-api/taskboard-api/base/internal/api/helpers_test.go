package api

import (
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"

	"example.com/taskboard/internal/auth"
	"example.com/taskboard/internal/clock"
	"example.com/taskboard/internal/service"
	"example.com/taskboard/internal/service/servicetest"
)

// update rewrites the golden files: go test ./internal/api -run Golden -update
var update = flag.Bool("update", false, "rewrite the golden files in testdata")

var fixedNow = time.Date(2026, 10, 1, 9, 0, 0, 0, time.UTC)

// The seed's user ids.
const (
	adaID      = 1
	graceID    = 2
	linusID    = 3
	margaretID = 4
)

// testAPI is the whole HTTP layer, middleware included, over real services and an
// in-memory database holding the contract's seed.
type testAPI struct {
	handler http.Handler
	db      *servicetest.DB
}

func newTestAPI(t *testing.T) testAPI {
	t.Helper()
	db := servicetest.Seeded()
	st := db.Stores()
	clk := clock.Fixed(fixedNow)
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	hasher, err := auth.NewHasher(bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	h := NewServer(Deps{
		Log:         log,
		Auth:        service.NewAuthService(st, hasher, auth.NewJWT([]byte("a test secret of at least 32 bytes"), clk), service.ModeSession, clk, log),
		Users:       service.NewUserService(st),
		Projects:    service.NewProjectService(st, clk),
		Tasks:       service.NewTaskService(st, &service.Hooks{}, clk, log),
		Comments:    service.NewCommentService(st, clk),
		Watchers:    service.NewWatcherService(st, clk, log),
		Attachments: service.NewAttachmentService(st, clk, log),
		Ready:       func(context.Context) error { return nil },
		CORSOrigins: []string{"http://localhost:20013"},
		Development: true,
	})
	return testAPI{handler: h, db: db}
}

// as gives a seed user a session without going through login, and returns its token.
func (a testAPI) as(userID int64) string {
	token := "test-session-" + strconv.FormatInt(userID, 10)
	a.db.AddSession(auth.HashToken(token), userID, fixedNow.Add(time.Hour))
	return token
}

// do sends one request through the handler in memory and returns the recorded
// response. headers are name, value pairs.
func (a testAPI) do(t *testing.T, method, path, token, body string, headers ...string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequestWithContext(t.Context(), method, path, strings.NewReader(body))
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	for i := 0; i+1 < len(headers); i += 2 {
		req.Header.Set(headers[i], headers[i+1])
	}
	rec := httptest.NewRecorder()
	a.handler.ServeHTTP(rec, req)
	return rec
}

// decode reads a JSON response body into a T.
func decode[T any](t *testing.T, rec *httptest.ResponseRecorder) T {
	t.Helper()
	var v T
	if err := json.Unmarshal(rec.Body.Bytes(), &v); err != nil {
		t.Fatalf("decode %s: %v", rec.Body, err)
	}
	return v
}

// wantStatus fails the test when the response has another status.
func wantStatus(t *testing.T, rec *httptest.ResponseRecorder, want int) {
	t.Helper()
	if rec.Code != want {
		t.Fatalf("status = %d, want %d; body %s", rec.Code, want, rec.Body)
	}
}

// assertGolden compares got, indented, with testdata/<name>.golden, or rewrites the
// file under -update. Only stable output goes into a golden file: times come from the
// fixed clock and the seed, and the request id is set by the test.
func assertGolden(t *testing.T, name string, got []byte) {
	t.Helper()
	var buf bytes.Buffer
	if err := json.Indent(&buf, got, "", "  "); err != nil {
		t.Fatalf("indent: %v", err)
	}
	path := filepath.Join("testdata", name+".golden")
	if *update {
		if err := os.WriteFile(path, buf.Bytes(), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	want, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("%v (run with -update to create it)", err)
	}
	if !bytes.Equal(buf.Bytes(), want) {
		t.Errorf("the response differs from %s:\n--- got\n%s\n--- want\n%s", path, buf.Bytes(), want)
	}
}
