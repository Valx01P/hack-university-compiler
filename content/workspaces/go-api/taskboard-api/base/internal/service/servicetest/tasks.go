package servicetest

import (
	"cmp"
	"context"
	"maps"
	"slices"
	"strings"

	"example.com/taskboard/internal/domain"
)

// TaskStore is the fake service.TaskStore: a map and a mutex (in DB). It must keep
// every promise the PostgreSQL TaskRepo keeps, and store/contract_test.go runs the
// same suite against both to prove it: not found is domain.ErrNotFound, versions go up
// by one and a stale one is a *domain.StaleTaskError, the assignee must be a member,
// filters and sorting match the SQL, and a delete takes comments and watchers along.
type TaskStore struct{ db *DB }

// NewTaskStore returns the fake TaskStore of db.
func NewTaskStore(db *DB) *TaskStore { return &TaskStore{db: db} }

// Get returns one task.
func (s *TaskStore) Get(ctx context.Context, id int64) (domain.Task, error) {
	s.db.mu.Lock()
	defer s.db.mu.Unlock()
	t, ok := s.db.tasks[id]
	if !ok {
		return domain.Task{}, notFound("task", id)
	}
	return t, nil
}

// List filters, sorts, and pages tasks the way ListProjectTasks does.
func (s *TaskStore) List(ctx context.Context, f domain.TaskFilter) ([]domain.Task, int64, error) {
	s.db.mu.Lock()
	defer s.db.mu.Unlock()
	var match []domain.Task
	for _, t := range s.db.tasks {
		if t.ProjectID != f.ProjectID ||
			(f.Status != nil && t.Status != *f.Status) ||
			(f.AssigneeID != nil && (t.AssigneeID == nil || *t.AssigneeID != *f.AssigneeID)) ||
			(f.Unassigned && t.AssigneeID != nil) ||
			(f.Query != "" && !containsFold(t.Title, f.Query) && (t.Description == nil || !containsFold(*t.Description, f.Query))) {
			continue
		}
		match = append(match, t)
	}
	slices.SortFunc(match, func(a, b domain.Task) int {
		return cmp.Or(compareBy(a, b, f.Sort, f.Desc), cmp.Compare(a.ID, b.ID))
	})
	total := int64(len(match))
	start := min(f.Offset, len(match))
	end := min(start+f.Limit, len(match))
	return match[start:end], total, nil
}

// compareBy orders two tasks by one sort key the way ListProjectTasks does: tasks
// without a due date come last in either direction, and titles ignore letter case.
func compareBy(a, b domain.Task, sort domain.TaskSort, desc bool) int {
	flip := func(c int) int {
		if desc {
			return -c
		}
		return c
	}
	switch sort {
	case domain.SortDue:
		switch {
		case a.DueOn == nil && b.DueOn == nil:
			return 0
		case a.DueOn == nil:
			return 1
		case b.DueOn == nil:
			return -1
		}
		return flip(a.DueOn.Compare(*b.DueOn))
	case domain.SortPriority:
		return flip(cmp.Compare(a.Priority, b.Priority))
	case domain.SortTitle:
		return flip(strings.Compare(strings.ToLower(a.Title), strings.ToLower(b.Title)))
	}
	return flip(a.CreatedAt.Compare(b.CreatedAt))
}

func containsFold(s, sub string) bool {
	return strings.Contains(strings.ToLower(s), strings.ToLower(sub))
}

// CountByStatus counts a project's tasks by status.
func (s *TaskStore) CountByStatus(ctx context.Context, projectID int64) (domain.TaskCounts, error) {
	s.db.mu.Lock()
	defer s.db.mu.Unlock()
	var c domain.TaskCounts
	for _, t := range s.db.tasks {
		if t.ProjectID == projectID {
			count(&c, t.Status)
		}
	}
	return c, nil
}

// Create runs the model's BeforeCreate hook and stores the task with the next id.
func (s *TaskStore) Create(ctx context.Context, t domain.Task) (domain.Task, error) {
	if err := beforeCreate(ctx, &t); err != nil {
		return domain.Task{}, err
	}
	s.db.mu.Lock()
	defer s.db.mu.Unlock()
	if err := s.db.checkAssignee(t); err != nil {
		return domain.Task{}, err
	}
	t.ID = s.db.next("tasks")
	s.db.tasks[t.ID] = t
	return t, nil
}

// Update saves a task's fields if it is still at t.Version.
func (s *TaskStore) Update(ctx context.Context, t domain.Task) (domain.Task, error) {
	if err := beforeUpdate(ctx, &t); err != nil {
		return domain.Task{}, err
	}
	s.db.mu.Lock()
	defer s.db.mu.Unlock()
	current, err := s.db.current(t)
	if err != nil {
		return domain.Task{}, err
	}
	if err := s.db.checkAssignee(t); err != nil {
		return domain.Task{}, err
	}
	current.Title, current.Description, current.Priority = t.Title, t.Description, t.Priority
	current.DueOn, current.AssigneeID, current.UpdatedAt = t.DueOn, t.AssigneeID, t.UpdatedAt
	current.Version++
	s.db.tasks[t.ID] = current
	return current, nil
}

// Transition saves a task's status if it is still at t.Version.
func (s *TaskStore) Transition(ctx context.Context, t domain.Task) (domain.Task, error) {
	s.db.mu.Lock()
	defer s.db.mu.Unlock()
	current, err := s.db.current(t)
	if err != nil {
		return domain.Task{}, err
	}
	current.Status, current.CompletedAt, current.UpdatedAt = t.Status, t.CompletedAt, t.UpdatedAt
	current.Version++
	s.db.tasks[t.ID] = current
	return current, nil
}

// current returns the stored task t is based on: missing is not found, and a different
// version is stale, as UPDATE ... WHERE version = $n finds no row.
func (db *DB) current(t domain.Task) (domain.Task, error) {
	current, ok := db.tasks[t.ID]
	if !ok {
		return domain.Task{}, notFound("task", t.ID)
	}
	if current.Version != t.Version {
		return domain.Task{}, &domain.StaleTaskError{Current: current}
	}
	return current, nil
}

// checkAssignee is the tasks_assignee_id_fkey constraint: an assignee must be a member
// of the task's project.
func (db *DB) checkAssignee(t domain.Task) error {
	if t.AssigneeID != nil && db.members[t.ProjectID][*t.AssigneeID] == "" {
		return domain.Invalid("assignee_id", "is not a member of this project")
	}
	return nil
}

// Delete removes a task with its comments, watchers, and attachments.
func (s *TaskStore) Delete(ctx context.Context, id int64) error {
	s.db.mu.Lock()
	defer s.db.mu.Unlock()
	if _, ok := s.db.tasks[id]; !ok {
		return notFound("task", id)
	}
	delete(s.db.tasks, id)
	delete(s.db.watchers, id)
	for cid, c := range s.db.comments {
		if c.TaskID == id {
			delete(s.db.comments, cid)
		}
	}
	for aid, a := range s.db.attachments {
		if a.TaskID == id {
			delete(s.db.attachments, aid)
		}
	}
	return nil
}

// beforeCreate and beforeUpdate run a model's hooks the way the real store does
// (store/hooks.go): only when the value has them.
func beforeCreate(ctx context.Context, v any) error {
	if h, ok := v.(interface{ BeforeCreate(context.Context) error }); ok {
		return h.BeforeCreate(ctx)
	}
	return nil
}

func beforeUpdate(ctx context.Context, v any) error {
	if h, ok := v.(interface{ BeforeUpdate(context.Context) error }); ok {
		return h.BeforeUpdate(ctx)
	}
	return nil
}

func sortedKeys[K cmp.Ordered, V any](m map[K]V) []K {
	return slices.Sorted(maps.Keys(m))
}

func sortBy[T any](s []T, less func(a, b T) bool) {
	slices.SortFunc(s, func(a, b T) int {
		switch {
		case less(a, b):
			return -1
		case less(b, a):
			return 1
		}
		return 0
	})
}
