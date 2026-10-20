package service_test

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"example.com/taskboard/internal/domain"
	"example.com/taskboard/internal/jobs"
	"example.com/taskboard/internal/service"
)

func ptr[T any](v T) *T { return &v }

func TestCreateFillsInDefaults(t *testing.T) {
	a := newApp(t, nil)
	got, err := a.tasks.Create(ctx(t), grace, 1, domain.Task{Title: "  Write the launch email  "})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if got.ID != 19 || got.Title != "Write the launch email" || got.Status != domain.StatusTodo ||
		got.Priority != domain.PriorityMedium || got.Version != 1 || !got.CreatedAt.Equal(fixedNow) {
		t.Errorf("Create = %+v", got)
	}
}

func TestCreateRefuses(t *testing.T) {
	tests := []struct {
		name      string
		actor     domain.User
		projectID int64
		task      domain.Task
		wantIs    error
		wantField string
	}{
		{"an outsider sees no project", margaret, 1, domain.Task{Title: "Ship it"}, domain.ErrNotFound, ""},
		{"an admin who is not a member reads but cannot write", ada, 3, domain.Task{Title: "Ship it"}, domain.ErrForbidden, ""},
		{"an empty title", grace, 1, domain.Task{Title: "   "}, nil, "title"},
		{"a title over 120 characters", grace, 1, domain.Task{Title: strings.Repeat("x", 121)}, nil, "title"},
		{"priority 4", grace, 1, domain.Task{Title: "Ship it", Priority: 4}, nil, "priority"},
		{"an assignee outside the project", grace, 1, domain.Task{Title: "Ship it", AssigneeID: ptr(int64(4))}, nil, "assignee_id"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			a := newApp(t, nil)
			_, err := a.tasks.Create(ctx(t), tc.actor, tc.projectID, tc.task)
			if tc.wantIs != nil {
				if !errors.Is(err, tc.wantIs) {
					t.Fatalf("err = %v, want %v", err, tc.wantIs)
				}
				return
			}
			v, ok := errors.AsType[*domain.ValidationError](err)
			if !ok {
				t.Fatalf("err = %v, want a *domain.ValidationError", err)
			}
			if _, ok := v.Fields[tc.wantField]; !ok {
				t.Errorf("fields = %v, want one for %s", v.Fields, tc.wantField)
			}
		})
	}
}

func TestUpdateClearsFields(t *testing.T) {
	a := newApp(t, nil)
	got, err := a.tasks.Update(ctx(t), grace, 1, domain.TaskPatch{
		DueOn:      domain.Change[*time.Time](nil),
		AssigneeID: domain.Change[*int64](nil),
	})
	if err != nil {
		t.Fatalf("Update: %v", err)
	}
	if got.DueOn != nil || got.AssigneeID != nil || got.Title != "Fix login redirect" {
		t.Errorf("Update = due %v, assignee %v, title %q", got.DueOn, got.AssigneeID, got.Title)
	}
}

func TestTransitions(t *testing.T) {
	// The seed has a task in each status in project 1: 2 is todo, 1 is doing, 6 is done.
	tests := []struct {
		taskID int64
		to     string
		ok     bool
	}{
		{2, "doing", true}, {2, "done", true}, {2, "todo", false},
		{1, "todo", true}, {1, "done", true}, {1, "doing", false},
		{6, "doing", true}, {6, "todo", false}, {6, "done", false},
		{2, "blocked", false},
	}
	for _, tc := range tests {
		t.Run(tc.to, func(t *testing.T) {
			a := newApp(t, nil)
			got, err := a.tasks.Transition(ctx(t), grace, tc.taskID, tc.to)
			if !tc.ok {
				v, ok := errors.AsType[*domain.ValidationError](err)
				if !ok || v.Fields["to"] == "" {
					t.Fatalf("task %d to %s: err = %v, want a validation error for to", tc.taskID, tc.to, err)
				}
				return
			}
			if err != nil {
				t.Fatalf("task %d to %s: %v", tc.taskID, tc.to, err)
			}
			if string(got.Status) != tc.to || got.Version != 2 {
				t.Errorf("task %d to %s: status %s, version %d", tc.taskID, tc.to, got.Status, got.Version)
			}
			if done := tc.to == "done"; done != (got.CompletedAt != nil) {
				t.Errorf("task %d to %s: completed_at = %v", tc.taskID, tc.to, got.CompletedAt)
			}
		})
	}
}

func TestDoneEnqueuesTaskCompleted(t *testing.T) {
	a := newApp(t, nil)
	if _, err := a.tasks.Transition(ctx(t), grace, 2, "done"); err != nil {
		t.Fatalf("Transition: %v", err)
	}
	got := a.db.Jobs()
	if len(got) != 1 || got[0].Kind != jobs.KindTaskCompleted || got[0].Payload != `{"task_id":2}` {
		t.Errorf("jobs = %+v, want one task.completed for task 2", got)
	}
	if _, err := a.tasks.Transition(ctx(t), grace, 2, "todo"); err == nil {
		t.Fatal("done to todo should fail")
	}
	if n := len(a.db.Jobs()); n != 1 {
		t.Errorf("a refused transition enqueued a job: %d jobs", n)
	}
}

func TestAssignmentEnqueuesAfterCommit(t *testing.T) {
	a := newApp(t, nil)
	// Task 2 is assigned to Ada. Reassigning it to Grace queues one job.
	if _, err := a.tasks.Update(ctx(t), grace, 2, domain.TaskPatch{AssigneeID: domain.Change(ptr(int64(2)))}); err != nil {
		t.Fatalf("Update: %v", err)
	}
	// The same assignee again queues nothing.
	if _, err := a.tasks.Update(ctx(t), grace, 2, domain.TaskPatch{AssigneeID: domain.Change(ptr(int64(2)))}); err != nil {
		t.Fatalf("Update: %v", err)
	}
	got := a.db.Jobs()
	if len(got) != 1 || got[0].Kind != jobs.KindTaskAssigned || got[0].Payload != `{"task_id":2,"assignee_id":2,"by":2}` {
		t.Errorf("jobs = %+v, want one task.assigned", got)
	}
}

func TestHooksRunInOrder(t *testing.T) {
	var order []string
	hooks := &service.Hooks{BeforeCreateTask: []func(context.Context, *domain.Task) error{
		service.TidyTitle,
		func(_ context.Context, t *domain.Task) error {
			order = append(order, t.Title)
			if strings.Contains(t.Title, "forbidden") {
				return domain.Invalid("title", "uses a word this team does not allow")
			}
			return nil
		},
	}}
	a := newApp(t, hooks)
	got, err := a.tasks.Create(ctx(t), grace, 1, domain.Task{Title: "Fix   the   footer"})
	if err != nil || got.Title != "Fix the footer" {
		t.Fatalf("Create = %q, %v", got.Title, err)
	}
	if _, err := a.tasks.Create(ctx(t), grace, 1, domain.Task{Title: "a forbidden word"}); err == nil {
		t.Fatal("a hook's error did not stop the create")
	}
	if len(order) != 2 || order[0] != "Fix the footer" {
		t.Errorf("the second hook saw %q, want the title TidyTitle cleaned first", order)
	}
}

func TestDeleteTakesCommentsAndFilesAlong(t *testing.T) {
	a := newApp(t, nil)
	png := "\x89PNG\r\n\x1a\n a tiny picture"
	if _, err := a.attachments.Upload(ctx(t), grace, 1, "diagram.png", "image/png", strings.NewReader(png)); err != nil {
		t.Fatalf("Upload: %v", err)
	}
	if len(a.db.Files()) != 1 {
		t.Fatalf("files = %v, want the upload", a.db.Files())
	}
	if err := a.tasks.Delete(ctx(t), ada, 1); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if _, err := a.tasks.Get(ctx(t), ada, 1); !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("Get after Delete: err = %v, want not found", err)
	}
	if _, err := a.commentsDB.Get(ctx(t), 1); !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("comment 1 of the deleted task: err = %v, want not found", err)
	}
	if files := a.db.Files(); len(files) != 0 {
		t.Errorf("files after the delete committed = %v, want none", files)
	}
}

func TestListIncludesRelatedData(t *testing.T) {
	a := newApp(t, nil)
	f := domain.TaskFilter{ProjectID: 1, Sort: domain.SortCreated, Limit: 2}
	page, err := a.tasks.List(ctx(t), grace, f, service.Include{Assignee: true, Watchers: true})
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if page.Total != 8 || len(page.Items) != 2 {
		t.Fatalf("List = %d items of %d, want 2 of 8", len(page.Items), page.Total)
	}
	first := page.Items[0]
	if first.Assignee == nil || first.Assignee.Name != "Grace Hopper" || len(first.Watchers) != 2 {
		t.Errorf("task 1 = assignee %v, watchers %v", first.Assignee, first.Watchers)
	}
	if second := page.Items[1]; second.Watchers == nil || len(second.Watchers) != 0 {
		t.Errorf("task 2's watchers = %#v, want an empty list", second.Watchers)
	}
}
