package store_test

import (
	"errors"
	"slices"
	"testing"
	"time"

	"example.com/taskboard/internal/domain"
	"example.com/taskboard/internal/service"
	"example.com/taskboard/internal/service/servicetest"
	"example.com/taskboard/internal/store"
	"example.com/taskboard/internal/testdb"
)

// TestTaskStoreContract runs one suite against both TaskStores, the in-memory fake
// the service tests use and the PostgreSQL repository, so the fake can never promise
// something the database does not do. Both start from the contract's seed.
func TestTaskStoreContract(t *testing.T) {
	t.Run("fake", func(t *testing.T) {
		testTaskStore(t, func(t *testing.T) service.TaskStore {
			return servicetest.NewTaskStore(servicetest.Seeded())
		})
	})
	t.Run("postgres", func(t *testing.T) {
		t.Skip("mapError is not written yet, so the PostgreSQL store cannot keep the contract (lesson 25 part 2)")
		testTaskStore(t, func(t *testing.T) service.TaskStore {
			pool := testdb.New(t)
			testdb.Seed(t, pool)
			return store.NewTaskRepo(store.New(pool))
		})
	})
}

func testTaskStore(t *testing.T, newStore func(t *testing.T) service.TaskStore) {
	now := time.Date(2026, 10, 1, 9, 0, 0, 0, time.UTC)

	t.Run("Get a missing task", func(t *testing.T) {
		_, err := newStore(t).Get(t.Context(), 999)
		if !errors.Is(err, domain.ErrNotFound) {
			t.Errorf("err = %v, want domain.ErrNotFound", err)
		}
	})

	t.Run("Create runs the model hook", func(t *testing.T) {
		s := newStore(t)
		got, err := s.Create(t.Context(), domain.Task{ProjectID: 1, Title: "  Tidy the backlog ", CreatedAt: now, UpdatedAt: now})
		if err != nil {
			t.Fatalf("Create: %v", err)
		}
		if got.ID != 19 || got.Title != "Tidy the backlog" || got.Status != domain.StatusTodo || got.Priority != domain.PriorityMedium || got.Version != 1 {
			t.Errorf("Create = %+v", got)
		}
	})

	t.Run("Create refuses an assignee outside the project", func(t *testing.T) {
		outsider := int64(4)
		_, err := newStore(t).Create(t.Context(), domain.Task{ProjectID: 1, Title: "Ship it", AssigneeID: &outsider, CreatedAt: now, UpdatedAt: now})
		if v, ok := errors.AsType[*domain.ValidationError](err); !ok || v.Fields["assignee_id"] == "" {
			t.Errorf("err = %v, want a validation error for assignee_id", err)
		}
	})

	t.Run("Update bumps the version and refuses a stale one", func(t *testing.T) {
		s := newStore(t)
		task, err := s.Get(t.Context(), 3)
		if err != nil {
			t.Fatal(err)
		}
		task.Title = "Design the pricing page v2"
		task.UpdatedAt = now
		updated, err := s.Update(t.Context(), task)
		if err != nil {
			t.Fatalf("Update: %v", err)
		}
		if updated.Version != 2 || updated.Title != "Design the pricing page v2" {
			t.Errorf("Update = version %d, title %q", updated.Version, updated.Title)
		}
		_, err = s.Update(t.Context(), task) // still at version 1
		stale, ok := errors.AsType[*domain.StaleTaskError](err)
		if !ok || stale.Current.Version != 2 {
			t.Errorf("stale Update: err = %v, want a *domain.StaleTaskError at version 2", err)
		}
	})

	t.Run("Transition saves the status with the version check", func(t *testing.T) {
		s := newStore(t)
		task, _ := s.Get(t.Context(), 2)
		task.Status, task.CompletedAt, task.UpdatedAt = domain.StatusDone, &now, now
		moved, err := s.Transition(t.Context(), task)
		if err != nil {
			t.Fatalf("Transition: %v", err)
		}
		if moved.Status != domain.StatusDone || moved.CompletedAt == nil || moved.Version != 2 {
			t.Errorf("Transition = %+v", moved)
		}
	})

	t.Run("Delete removes a task, and a missing one is not found", func(t *testing.T) {
		s := newStore(t)
		if err := s.Delete(t.Context(), 1); err != nil {
			t.Fatalf("Delete: %v", err)
		}
		if _, err := s.Get(t.Context(), 1); !errors.Is(err, domain.ErrNotFound) {
			t.Errorf("Get after Delete: err = %v", err)
		}
		if err := s.Delete(t.Context(), 1); !errors.Is(err, domain.ErrNotFound) {
			t.Errorf("Delete again: err = %v, want domain.ErrNotFound", err)
		}
	})

	t.Run("List filters, sorts, pages, and counts", func(t *testing.T) {
		s := newStore(t)
		todo := domain.StatusTodo
		grace := int64(2)
		tests := []struct {
			f     domain.TaskFilter
			want  []int64
			total int64
		}{
			{domain.TaskFilter{ProjectID: 1, Sort: domain.SortCreated, Limit: 20}, []int64{1, 2, 3, 4, 5, 6, 7, 8}, 8},
			{domain.TaskFilter{ProjectID: 1, Status: &todo, Sort: domain.SortDue, Limit: 2}, []int64{2, 5}, 3},
			{domain.TaskFilter{ProjectID: 1, AssigneeID: &grace, Sort: domain.SortCreated, Limit: 20}, []int64{1, 3, 5, 8}, 4},
			{domain.TaskFilter{ProjectID: 2, Unassigned: true, Sort: domain.SortCreated, Limit: 20}, []int64{10, 15}, 2},
			{domain.TaskFilter{ProjectID: 1, Sort: domain.SortPriority, Desc: true, Limit: 20}, []int64{1, 3, 2, 5, 7, 4, 6, 8}, 8},
			{domain.TaskFilter{ProjectID: 1, Sort: domain.SortTitle, Limit: 3, Offset: 2}, []int64{3, 1, 4}, 8},
			{domain.TaskFilter{ProjectID: 3, Query: "0%", Sort: domain.SortCreated, Limit: 20}, []int64{17}, 1},
		}
		for _, tc := range tests {
			tasks, total, err := s.List(t.Context(), tc.f)
			if err != nil {
				t.Fatalf("List(%+v): %v", tc.f, err)
			}
			var ids []int64
			for _, task := range tasks {
				ids = append(ids, task.ID)
			}
			if !slices.Equal(ids, tc.want) || total != tc.total {
				t.Errorf("List(%+v) = %v of %d, want %v of %d", tc.f, ids, total, tc.want, tc.total)
			}
		}
	})

	t.Run("CountByStatus", func(t *testing.T) {
		got, err := newStore(t).CountByStatus(t.Context(), 2)
		if err != nil || got != (domain.TaskCounts{Todo: 2, Doing: 3, Done: 2}) {
			t.Errorf("CountByStatus(2) = %+v, %v", got, err)
		}
	})
}
