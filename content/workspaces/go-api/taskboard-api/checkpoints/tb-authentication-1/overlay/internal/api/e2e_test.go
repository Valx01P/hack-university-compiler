package api

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"

	"example.com/taskboard/internal/auth"
	"example.com/taskboard/internal/clock"
	"example.com/taskboard/internal/service"
	"example.com/taskboard/internal/store"
	"example.com/taskboard/internal/testdb"
)

// TestE2ECommentFlow drives the real stack, every layer down to PostgreSQL, through
// HTTP: sign up, log in, make a project and a task, then add, list, and delete a
// comment. `go test -short` skips it.
func TestE2ECommentFlow(t *testing.T) {
	pool := testdb.New(t)
	st := store.New(pool)
	stores := service.Stores{
		Tasks: store.NewTaskRepo(st), Projects: store.NewProjectRepo(st), Users: store.NewUserRepo(st),
		Comments: store.NewCommentRepo(st), Watchers: store.NewWatcherRepo(st), Sessions: store.NewSessionRepo(st),
		Jobs: store.NewJobRepo(st), Attachments: store.NewAttachmentRepo(st), Tx: st,
	}
	clk := clock.Fixed(fixedNow)
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	hasher, err := auth.NewHasher(bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(NewServer(Deps{
		Log:      log,
		Auth:     service.NewAuthService(stores, hasher, nil, service.ModeSession, clk, log),
		Users:    service.NewUserService(stores),
		Projects: service.NewProjectService(stores, clk),
		Tasks:    service.NewTaskService(stores, &service.Hooks{}, clk, log),
		Comments: service.NewCommentService(stores, clk),
		Watchers: service.NewWatcherService(stores, clk, log),
		Ready:    func(ctx context.Context) error { return pool.Ping(ctx) },
	}))
	t.Cleanup(srv.Close)

	var token string
	call := func(method, path, body string, want int) map[string]any {
		t.Helper()
		req, _ := http.NewRequestWithContext(t.Context(), method, srv.URL+path, strings.NewReader(body))
		if body != "" {
			req.Header.Set("Content-Type", "application/json")
		}
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		res, err := srv.Client().Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		var out map[string]any
		dec := json.NewDecoder(res.Body)
		dec.UseNumber() // ids stay exact, as json.Number
		_ = dec.Decode(&out)
		if res.StatusCode != want {
			t.Fatalf("%s %s = %d %v, want %d", method, path, res.StatusCode, out, want)
		}
		return out
	}
	id := func(m map[string]any) string { return m["id"].(json.Number).String() }

	call("POST", "/v1/auth/signup", `{"email": "kj@example.com", "name": "Katherine Johnson", "password": "hidden figures 1962"}`, 201)
	token = "e2e-session-token"
	_, err = pool.Exec(t.Context(), `INSERT INTO sessions (token_hash, user_id, expires_at)
		SELECT $1, id, $2 FROM users WHERE email = 'kj@example.com'`, auth.HashToken(token), fixedNow.Add(time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	project := id(call("POST", "/v1/projects", `{"name": "Orbits"}`, 201))
	task := id(call("POST", "/v1/projects/"+project+"/tasks", `{"title": "Check the numbers"}`, 201))
	comment := id(call("POST", "/v1/tasks/"+task+"/comments", `{"body": "  Done by hand.  "}`, 201))
	if items := call("GET", "/v1/tasks/"+task+"/comments", "", 200)["items"].([]any); len(items) != 1 {
		t.Fatalf("comments = %v, want 1", items)
	}
	call("DELETE", "/v1/comments/"+comment, "", 204)
	if items := call("GET", "/v1/tasks/"+task+"/comments", "", 200)["items"].([]any); len(items) != 0 {
		t.Fatalf("comments after delete = %v, want none", items)
	}
}
