package store

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"

	"example.com/taskboard/internal/domain"
	"example.com/taskboard/internal/store/sqlcdb"
)

// TaskRepo is the PostgreSQL TaskStore.
type TaskRepo struct{ s *Store }

// NewTaskRepo returns the task repository of s.
func NewTaskRepo(s *Store) *TaskRepo { return &TaskRepo{s: s} }

// Get returns one task.
func (r *TaskRepo) Get(ctx context.Context, id int64) (domain.Task, error) {
	row, err := r.s.queries(ctx).GetTask(ctx, id)
	if err != nil {
		return domain.Task{}, mapError(err, "task", id)
	}
	return toDomainTask(row)
}

// List returns one page of a project's tasks and how many match the filter in all:
// two queries with the same WHERE.
func (r *TaskRepo) List(ctx context.Context, f domain.TaskFilter) ([]domain.Task, int64, error) {
	q := r.s.queries(ctx)
	var status *string
	if f.Status != nil {
		s := string(*f.Status)
		status = &s
	}
	pattern := likePattern(f.Query)
	rows, err := q.ListProjectTasks(ctx, sqlcdb.ListProjectTasksParams{
		ProjectID:  f.ProjectID,
		Status:     status,
		AssigneeID: f.AssigneeID,
		Unassigned: f.Unassigned,
		Pattern:    pattern,
		Sort:       string(f.Sort),
		Descending: f.Desc,
		RowLimit:   int32(f.Limit),
		RowOffset:  int32(f.Offset),
	})
	if err != nil {
		return nil, 0, mapError(err, "tasks", 0)
	}
	total, err := q.CountProjectTasks(ctx, sqlcdb.CountProjectTasksParams{
		ProjectID:  f.ProjectID,
		Status:     status,
		AssigneeID: f.AssigneeID,
		Unassigned: f.Unassigned,
		Pattern:    pattern,
	})
	if err != nil {
		return nil, 0, mapError(err, "tasks", 0)
	}
	tasks, err := mapErr(rows, toDomainTask)
	return tasks, total, err
}

// Create inserts a task after its BeforeCreate hook.
func (r *TaskRepo) Create(ctx context.Context, t domain.Task) (domain.Task, error) {
	if err := beforeCreate(ctx, &t); err != nil {
		return domain.Task{}, err
	}
	row, err := r.s.queries(ctx).CreateTask(ctx, sqlcdb.CreateTaskParams{
		ProjectID:   t.ProjectID,
		Title:       t.Title,
		Description: t.Description,
		Status:      string(t.Status),
		Priority:    int16(t.Priority),
		DueOn:       t.DueOn,
		AssigneeID:  t.AssigneeID,
		Version:     t.Version,
		CompletedAt: t.CompletedAt,
		CreatedAt:   t.CreatedAt,
		UpdatedAt:   t.UpdatedAt,
	})
	if err != nil {
		return domain.Task{}, mapError(err, "task", 0)
	}
	return toDomainTask(row)
}

// Update saves t's fields after its BeforeUpdate hook, if the stored task is still at
// t.Version, and returns it at the next version.
func (r *TaskRepo) Update(ctx context.Context, t domain.Task) (domain.Task, error) {
	if err := beforeUpdate(ctx, &t); err != nil {
		return domain.Task{}, err
	}
	row, err := r.s.queries(ctx).UpdateTask(ctx, sqlcdb.UpdateTaskParams{
		ID:          t.ID,
		Version:     t.Version,
		Title:       t.Title,
		Description: t.Description,
		Priority:    int16(t.Priority),
		DueOn:       t.DueOn,
		AssigneeID:  t.AssigneeID,
		UpdatedAt:   t.UpdatedAt,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Task{}, r.stale(ctx, t.ID)
	}
	if err != nil {
		return domain.Task{}, mapError(err, "task", t.ID)
	}
	return toDomainTask(row)
}

// Transition saves t's status and completed_at, with the same version check.
func (r *TaskRepo) Transition(ctx context.Context, t domain.Task) (domain.Task, error) {
	row, err := r.s.queries(ctx).TransitionTask(ctx, sqlcdb.TransitionTaskParams{
		ID:          t.ID,
		Version:     t.Version,
		Status:      string(t.Status),
		CompletedAt: t.CompletedAt,
		UpdatedAt:   t.UpdatedAt,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Task{}, r.stale(ctx, t.ID)
	}
	if err != nil {
		return domain.Task{}, mapError(err, "task", t.ID)
	}
	return toDomainTask(row)
}

// stale explains an UPDATE that matched no row: either the task is gone, or someone
// changed it first and its version moved on.
func (r *TaskRepo) stale(ctx context.Context, id int64) error {
	current, err := r.Get(ctx, id)
	if err != nil {
		return err
	}
	return &domain.StaleTaskError{Current: current}
}

// Delete removes a task. Its comments, watchers, and attachments go with it through
// ON DELETE CASCADE.
func (r *TaskRepo) Delete(ctx context.Context, id int64) error {
	n, err := r.s.queries(ctx).DeleteTask(ctx, id)
	if err != nil {
		return mapError(err, "task", id)
	}
	if n == 0 {
		return fmt.Errorf("task %d %w", id, domain.ErrNotFound)
	}
	return nil
}

// toDomainTask turns a row into a domain.Task. The status is parsed, not trusted: a
// value the domain does not know is an error here instead of a surprise later.
func toDomainTask(row sqlcdb.Task) (domain.Task, error) {
	status, err := domain.ParseStatus(row.Status)
	if err != nil {
		return domain.Task{}, fmt.Errorf("task %d: %w", row.ID, err)
	}
	return domain.Task{
		ID:          row.ID,
		ProjectID:   row.ProjectID,
		Title:       row.Title,
		Description: row.Description,
		Status:      status,
		Priority:    domain.Priority(row.Priority),
		DueOn:       row.DueOn,
		AssigneeID:  row.AssigneeID,
		Version:     row.Version,
		CompletedAt: row.CompletedAt,
		CreatedAt:   row.CreatedAt,
		UpdatedAt:   row.UpdatedAt,
	}, nil
}

// likePattern turns search text into an ILIKE pattern that finds it anywhere, with
// LIKE's own characters escaped so "0%" looks for a zero and a percent sign. Empty
// text is nil: no filter.
func likePattern(text string) *string {
	if text == "" {
		return nil
	}
	escaped := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(text)
	pattern := "%" + escaped + "%"
	return &pattern
}
