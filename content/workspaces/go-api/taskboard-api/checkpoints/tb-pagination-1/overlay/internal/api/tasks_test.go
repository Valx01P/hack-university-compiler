package api

import (
	"net/http"
	"slices"
	"strconv"
	"strings"
	"testing"
)

func TestGetTaskGolden(t *testing.T) {
	a := newTestAPI(t)
	rec := a.do(t, "GET", "/v1/tasks/3", a.as(graceID), "")
	wantStatus(t, rec, http.StatusOK)
	if got := rec.Header().Get("ETag"); got != `"v1"` {
		t.Errorf("ETag = %s, want \"v1\"", got)
	}
	assertGolden(t, "get_task", rec.Body.Bytes())
}

func TestListTasksGolden(t *testing.T) {
	a := newTestAPI(t)
	rec := a.do(t, "GET", "/v1/projects/1/tasks?status=todo&include=assignee,watchers", a.as(graceID), "")
	wantStatus(t, rec, http.StatusOK)
	assertGolden(t, "list_tasks", rec.Body.Bytes())
}

func TestNotFoundProblemGolden(t *testing.T) {
	a := newTestAPI(t)
	rec := a.do(t, "GET", "/v1/tasks/999", a.as(graceID), "", "X-Request-ID", "golden-test")
	wantStatus(t, rec, http.StatusNotFound)
	if got := rec.Header().Get("Content-Type"); got != "application/problem+json" {
		t.Errorf("Content-Type = %s", got)
	}
	assertGolden(t, "problem_not_found", rec.Body.Bytes())
}

func TestListTasks(t *testing.T) {
	tests := []struct {
		query string
		want  []int64
		total int64
	}{
		{"", []int64{1, 2, 3, 4, 5, 6, 7, 8}, 8},
		{"?status=todo", []int64{2, 5, 7}, 3},
		{"?assignee_id=2", []int64{1, 3, 5, 8}, 4},
		{"?assignee_id=none", []int64{4}, 1},
		{"?sort=due", []int64{6, 2, 5, 3, 7, 8, 1, 4}, 8},
		{"?sort=due&order=desc", []int64{4, 1, 8, 7, 3, 5, 2, 6}, 8},
		{"?sort=priority&order=desc", []int64{1, 3, 2, 5, 7, 4, 6, 8}, 8},
		{"?sort=title", []int64{8, 5, 3, 1, 4, 6, 7, 2}, 8},
		{"?q=LOGIN", []int64{1}, 1},
		{"?q=contrast", []int64{5}, 1},
	}
	a := newTestAPI(t)
	token := a.as(adaID)
	for _, tc := range tests {
		t.Run(tc.query, func(t *testing.T) {
			rec := a.do(t, "GET", "/v1/projects/1/tasks"+tc.query, token, "")
			wantStatus(t, rec, http.StatusOK)
			var ids []int64
			for _, item := range decode[[]taskResponse](t, rec) {
				ids = append(ids, item.ID)
			}
			if !slices.Equal(ids, tc.want) || int64(len(ids)) != tc.total {
				t.Errorf("ids %v, want %v", ids, tc.want)
			}
		})
	}
}

func TestListTasksRejectsBadParameters(t *testing.T) {
	a := newTestAPI(t)
	rec := a.do(t, "GET", "/v1/projects/1/tasks?status=blocked&sort=password&order=up&assignee_id=grace&q=a", a.as(adaID), "")
	wantStatus(t, rec, http.StatusBadRequest)
	p := decode[problem](t, rec)
	for _, name := range []string{"status", "sort", "order", "assignee_id", "q"} {
		if p.Errors[name] == "" {
			t.Errorf("errors has nothing for %s: %v", name, p.Errors)
		}
	}
}

func TestCreateTask(t *testing.T) {
	a := newTestAPI(t)
	rec := a.do(t, "POST", "/v1/projects/1/tasks", a.as(graceID), `{"title": "  Write the launch email  ", "priority": 3, "due_on": "2026-10-12", "assignee_id": 1}`)
	wantStatus(t, rec, http.StatusCreated)
	got := decode[taskResponse](t, rec)
	if got.ID != 19 || got.Title != "Write the launch email" || got.Status != "todo" || *got.DueOn != "2026-10-12" {
		t.Errorf("created %+v", got)
	}
	if rec.Header().Get("Location") != "/v1/tasks/19" || rec.Header().Get("ETag") != `"v1"` {
		t.Errorf("Location %q, ETag %q", rec.Header().Get("Location"), rec.Header().Get("ETag"))
	}
}

func TestCreateTaskRejects(t *testing.T) {
	tests := []struct {
		name   string
		body   string
		status int
		field  string
	}{
		{"an empty title", `{"title": "   "}`, 422, "title"},
		{"priority 4", `{"title": "Ship it", "priority": 4}`, 422, "priority"},
		{"priority as a word", `{"title": "Ship it", "priority": "high"}`, 400, "priority"},
		{"a date that does not exist", `{"title": "Ship it", "due_on": "2026-13-01"}`, 422, "due_on"},
		{"an assignee outside the project", `{"title": "Ship it", "assignee_id": 4}`, 422, "assignee_id"},
		{"status, which is not a field here", `{"title": "Ship it", "status": "done"}`, 400, "status"},
		{"a body that is not JSON", `{"title": `, 400, ""},
		{"two JSON objects", `{"title": "a"}{"title": "b"}`, 400, ""},
	}
	a := newTestAPI(t)
	token := a.as(graceID)
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			rec := a.do(t, "POST", "/v1/projects/1/tasks", token, tc.body)
			wantStatus(t, rec, tc.status)
			if p := decode[problem](t, rec); tc.field != "" && p.Errors[tc.field] == "" {
				t.Errorf("errors = %v, want one for %s", p.Errors, tc.field)
			}
		})
	}
}

func TestUpdateTaskNeedsIfMatch(t *testing.T) {
	a := newTestAPI(t)
	token := a.as(graceID)

	rec := a.do(t, "PATCH", "/v1/tasks/3", token, `{"priority": 1}`)
	wantStatus(t, rec, http.StatusPreconditionRequired)

	rec = a.do(t, "PATCH", "/v1/tasks/3", token, `{"title": "Design the pricing page v2"}`, "If-Match", `"v1"`)
	wantStatus(t, rec, http.StatusOK)
	if got := rec.Header().Get("ETag"); got != `"v2"` {
		t.Errorf("ETag = %s, want \"v2\"", got)
	}

	rec = a.do(t, "PATCH", "/v1/tasks/3", token, `{"priority": 1}`, "If-Match", `"v1"`)
	wantStatus(t, rec, http.StatusPreconditionFailed)
	p := decode[problem](t, rec)
	if p.Current == nil || p.Current.Version != 2 || p.Current.Title != "Design the pricing page v2" {
		t.Errorf("current = %+v, want the task at version 2", p.Current)
	}

	rec = a.do(t, "PATCH", "/v1/tasks/3", token, `{"status": "done"}`, "If-Match", `"v2"`)
	wantStatus(t, rec, http.StatusBadRequest)
}

func TestUpdateTaskClearsWithNull(t *testing.T) {
	a := newTestAPI(t)
	rec := a.do(t, "PATCH", "/v1/tasks/1", a.as(graceID), `{"due_on": null, "assignee_id": null, "description": "New words."}`, "If-Match", `"v1"`)
	wantStatus(t, rec, http.StatusOK)
	got := decode[taskResponse](t, rec)
	if got.DueOn != nil || got.AssigneeID != nil || got.Description == nil || *got.Description != "New words." {
		t.Errorf("got due %v, assignee %v, description %v", got.DueOn, got.AssigneeID, got.Description)
	}
}

func TestTransitionTask(t *testing.T) {
	a := newTestAPI(t)
	token := a.as(graceID)
	rec := a.do(t, "POST", "/v1/tasks/2/transition", token, `{"to": "done"}`)
	wantStatus(t, rec, http.StatusOK)
	got := decode[taskResponse](t, rec)
	if got.Status != "done" || got.CompletedAt == nil || !got.CompletedAt.Equal(fixedNow) || got.Version != 2 {
		t.Errorf("got %+v", got)
	}
	rec = a.do(t, "POST", "/v1/tasks/2/transition", token, `{"to": "todo"}`)
	wantStatus(t, rec, http.StatusUnprocessableEntity)
	if p := decode[problem](t, rec); p.Errors["to"] == "" {
		t.Errorf("errors = %v, want one for to", p.Errors)
	}
}

func TestQueryCountHeader(t *testing.T) {
	a := newTestAPI(t)
	rec := a.do(t, "GET", "/v1/projects/1/tasks?include=assignee,watchers", a.as(graceID), "")
	wantStatus(t, rec, http.StatusOK)
	n, err := strconv.Atoi(rec.Header().Get("X-Query-Count"))
	if err != nil || n != 0 {
		// The fakes run no SQL, so nothing is counted, but the header is there.
		t.Errorf("X-Query-Count = %q", rec.Header().Get("X-Query-Count"))
	}
	if !strings.Contains(rec.Body.String(), `"watchers":[`) {
		t.Errorf("include=watchers added no watchers: %s", rec.Body)
	}
}
