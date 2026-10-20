package service_test

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"example.com/taskboard/internal/api"
	"example.com/taskboard/internal/service"
)

// server serves the whole API over a fresh seeded fake database.
func server(t *testing.T) *httptest.Server {
	t.Helper()
	a := newApp(t, nil)
	h := api.NewServer(api.Deps{
		Log:         slog.New(slog.NewTextHandler(io.Discard, nil)),
		Auth:        a.auth,
		Users:       service.NewUserService(a.db.Stores()),
		Projects:    a.projects,
		Tasks:       a.tasks,
		Comments:    a.comments,
		Watchers:    a.watchers,
		Attachments: a.attachments,
		Ready:       func(context.Context) error { return nil },
	})
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	return srv
}

// loginAs logs in as a seed user, by first name, and returns their token.
func loginAs(t *testing.T, srv *httptest.Server, name string) string {
	t.Helper()
	body := `{"email": "` + name + `@example.com", "password": "correct horse battery staple"}`
	res, err := srv.Client().Post(srv.URL+"/v1/auth/login", "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	var login struct{ Token string }
	if err := json.NewDecoder(res.Body).Decode(&login); err != nil || res.StatusCode != http.StatusOK {
		t.Fatalf("login as %s: %d %v", name, res.StatusCode, err)
	}
	return login.Token
}

// TestPolicyMatrix is the authorization matrix: each row is who does what, and the
// status they must get. Seed facts it relies on: Ada (an admin) owns project 1 with
// Grace as a member, Grace owns project 2 with Linus and Ada as members, Linus owns
// project 3 alone, and Margaret is in no project. Task 5 is in project 1 and assigned
// to Grace, and comment 2 on task 1 is Grace's.
func TestPolicyMatrix(t *testing.T) {
	rows := []struct {
		who, action, method, path, body string
		want                            int
	}{
		// Projects: members and admins read, owners change.
		{"ada", "read own project", "GET", "/v1/projects/1", "", 200},
		{"grace", "read as a member", "GET", "/v1/projects/1", "", 200},
		{"linus", "read as a stranger", "GET", "/v1/projects/1", "", 404},
		{"ada", "read as an admin", "GET", "/v1/projects/3", "", 200},
		{"ada", "rename own project", "PATCH", "/v1/projects/1", `{"name": "Website Relaunch 2"}`, 200},
		{"grace", "rename as a member", "PATCH", "/v1/projects/1", `{"name": "Website Relaunch 2"}`, 403},
		{"ada", "rename as an admin who does not own it", "PATCH", "/v1/projects/3", `{"name": "Data Pipeline 2"}`, 403},
		{"linus", "rename as a stranger", "PATCH", "/v1/projects/1", `{"name": "Website Relaunch 2"}`, 404},
		{"grace", "add a member as the owner", "POST", "/v1/projects/2/members", `{"user_id": 4}`, 201},
		{"linus", "add a member as a member", "POST", "/v1/projects/2/members", `{"user_id": 4}`, 403},
		{"margaret", "add a member as a stranger", "POST", "/v1/projects/2/members", `{"user_id": 4}`, 404},

		// Tasks: members write, only owners delete.
		{"grace", "create a task as a member", "POST", "/v1/projects/1/tasks", `{"title": "Ship it"}`, 201},
		{"ada", "create as an admin who is not a member", "POST", "/v1/projects/3/tasks", `{"title": "Ship it"}`, 403},
		{"margaret", "create as a stranger", "POST", "/v1/projects/1/tasks", `{"title": "Ship it"}`, 404},
		{"ada", "delete a task as the owner", "DELETE", "/v1/tasks/5", "", 204},
		{"grace", "delete a task as a member", "DELETE", "/v1/tasks/2", "", 403},
		{"grace", "delete a task as its assignee", "DELETE", "/v1/tasks/5", "", 403},
		{"linus", "delete a task as a stranger", "DELETE", "/v1/tasks/1", "", 404},
		{"ada", "delete a task as an admin who does not own the project", "DELETE", "/v1/tasks/16", "", 403},
		{"ada", "delete a task as a member who is not the owner", "DELETE", "/v1/tasks/9", "", 403},

		// Comments: their author or an owner deletes them.
		{"grace", "delete own comment", "DELETE", "/v1/comments/2", "", 204},
		{"grace", "delete someone else's comment", "DELETE", "/v1/comments/3", "", 403},
		{"ada", "delete a comment as the owner", "DELETE", "/v1/comments/2", "", 204},
		{"ada", "delete a comment as an admin who is not a member", "DELETE", "/v1/comments/29", "", 403},
		{"margaret", "delete a comment as a stranger", "DELETE", "/v1/comments/1", "", 404},
	}
	for _, row := range rows {
		t.Run(row.who+"/"+row.action, func(t *testing.T) {
			srv := server(t)
			token := loginAs(t, srv, row.who)
			req, err := http.NewRequestWithContext(t.Context(), row.method, srv.URL+row.path, strings.NewReader(row.body))
			if err != nil {
				t.Fatal(err)
			}
			req.Header.Set("Authorization", "Bearer "+token)
			if row.body != "" {
				req.Header.Set("Content-Type", "application/json")
			}
			res, err := srv.Client().Do(req)
			if err != nil {
				t.Fatal(err)
			}
			res.Body.Close()
			if res.StatusCode != row.want {
				t.Errorf("%s %s as %s = %d, want %d", row.method, row.path, row.who, res.StatusCode, row.want)
			}
		})
	}
}
