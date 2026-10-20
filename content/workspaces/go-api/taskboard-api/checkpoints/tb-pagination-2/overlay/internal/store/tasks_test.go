package store_test

import (
	"errors"
	"slices"
	"testing"
	"time"

	"example.com/taskboard/internal/domain"
	"example.com/taskboard/internal/store"
	"example.com/taskboard/internal/testdb"
)

// These tests run against real PostgreSQL, each in its own schema (testdb.New), and
// are skipped by `go test -short`.

func TestDeleteCascades(t *testing.T) {
	t.Parallel()
	pool := testdb.New(t)
	testdb.Seed(t, pool)
	repo := store.NewTaskRepo(store.New(pool))
	if err := repo.Delete(t.Context(), 1); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	var comments, watchers int
	err := pool.QueryRow(t.Context(), `SELECT
		(SELECT count(*) FROM comments WHERE task_id = 1), (SELECT count(*) FROM task_watchers WHERE task_id = 1)`).
		Scan(&comments, &watchers)
	if err != nil {
		t.Fatal(err)
	}
	if comments != 0 || watchers != 0 {
		t.Errorf("after deleting task 1: %d comments and %d watchers left, want 0", comments, watchers)
	}
}

func TestListWithFactories(t *testing.T) {
	t.Parallel()
	pool := testdb.New(t)
	owner := testdb.CreateUser(t, pool, testdb.WithName("Owner"))
	helper := testdb.CreateUser(t, pool)
	project := testdb.CreateProject(t, pool, owner.ID, "Factory Project", helper.ID)
	day := func(d int) testdb.TaskOption {
		return testdb.WithCreatedAt(testdb.Time.Add(time.Duration(d) * time.Hour))
	}
	a := testdb.CreateTask(t, pool, project, "Alpha", testdb.WithStatus("doing"), testdb.WithAssignee(helper.ID), day(1))
	b := testdb.CreateTask(t, pool, project, "beta", testdb.WithDue("2026-10-05"), day(2))
	c := testdb.CreateTask(t, pool, project, "Gamma", testdb.WithStatus("done"), testdb.WithDue("2026-10-02"), day(3))

	repo := store.NewTaskRepo(store.New(pool))
	doing := domain.StatusDoing
	tests := []struct {
		name string
		f    domain.TaskFilter
		want []int64
	}{
		{"no filter", domain.TaskFilter{Sort: domain.SortCreated}, []int64{a, b, c}},
		{"by status", domain.TaskFilter{Status: &doing, Sort: domain.SortCreated}, []int64{a}},
		{"by assignee", domain.TaskFilter{AssigneeID: &helper.ID, Sort: domain.SortCreated}, []int64{a}},
		{"due dates first, missing last", domain.TaskFilter{Sort: domain.SortDue}, []int64{c, b, a}},
		{"title ignores case", domain.TaskFilter{Sort: domain.SortTitle, Desc: true}, []int64{c, b, a}},
		{"search the title", domain.TaskFilter{Query: "ET", Sort: domain.SortCreated}, []int64{b}},
	}
	for _, tc := range tests {
		tc.f.ProjectID, tc.f.Limit = project, 20
		got, total, err := repo.List(t.Context(), tc.f)
		if err != nil {
			t.Fatalf("%s: %v", tc.name, err)
		}
		var ids []int64
		for _, task := range got {
			ids = append(ids, task.ID)
		}
		if !slices.Equal(ids, tc.want) || total != int64(len(tc.want)) {
			t.Errorf("%s: got %v (total %d), want %v", tc.name, ids, total, tc.want)
		}
	}
}

func TestErrorsBecomeDomainErrors(t *testing.T) {
	t.Parallel()
	pool := testdb.New(t)
	testdb.Seed(t, pool)
	st := store.New(pool)

	_, err := store.NewProjectRepo(st).Create(t.Context(), domain.Project{OwnerID: 1, Name: "WEBSITE RELAUNCH", Color: "#2563eb", CreatedAt: testdb.Time})
	if c, ok := errors.AsType[*domain.ConflictError](err); !ok || c.Fields["name"] == "" || !errors.Is(err, domain.ErrConflict) {
		t.Errorf("a duplicate name in other letters: err = %v, want a conflict on name", err)
	}

	nobody := int64(999)
	_, err = store.NewTaskRepo(st).Create(t.Context(), domain.Task{ProjectID: 1, Title: "Ship it", AssigneeID: &nobody, CreatedAt: testdb.Time, UpdatedAt: testdb.Time})
	if v, ok := errors.AsType[*domain.ValidationError](err); !ok || v.Fields["assignee_id"] == "" {
		t.Errorf("assignee 999: err = %v, want a validation error on assignee_id", err)
	}

	_, err = store.NewTaskRepo(st).Get(t.Context(), 999)
	if !errors.Is(err, domain.ErrNotFound) || err.Error() != "task 999 not found" {
		t.Errorf("task 999: err = %v", err)
	}
}

func TestTriggerStampsUpdatesFromOutsideTheAPI(t *testing.T) {
	t.Parallel()
	pool := testdb.New(t)
	testdb.Seed(t, pool)
	// An UPDATE like one typed into psql: it sets neither version nor updated_at.
	if _, err := pool.Exec(t.Context(), `UPDATE tasks SET title = 'Fix the login redirect' WHERE id = 1`); err != nil {
		t.Fatal(err)
	}
	task, err := store.NewTaskRepo(store.New(pool)).Get(t.Context(), 1)
	if err != nil {
		t.Fatal(err)
	}
	if task.Version != 2 || !task.UpdatedAt.After(time.Date(2026, 9, 10, 9, 0, 0, 0, time.UTC)) {
		t.Errorf("after a psql UPDATE: version %d, updated_at %v, want 2 and later than the seed", task.Version, task.UpdatedAt)
	}
}

func TestQueryName(t *testing.T) {
	if got := store.QueryName("-- name: ListComments :many\nSELECT 1"); got != "ListComments" {
		t.Errorf("QueryName = %q", got)
	}
	if got := store.QueryName("SELECT pg_sleep(1)"); got != "" {
		t.Errorf("QueryName of unnamed SQL = %q", got)
	}
}
