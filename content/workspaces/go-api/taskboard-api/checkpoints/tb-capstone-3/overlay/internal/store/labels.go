package store

import (
	"context"
	"fmt"

	"example.com/taskboard/internal/domain"
	"example.com/taskboard/internal/store/sqlcdb"
)

// LabelRepo is the PostgreSQL LabelStore.
type LabelRepo struct{ s *Store }

// NewLabelRepo returns the label repository of s.
func NewLabelRepo(s *Store) *LabelRepo { return &LabelRepo{s: s} }

// Create stores a label after its BeforeCreate hook.
func (r *LabelRepo) Create(ctx context.Context, l domain.Label) (domain.Label, error) {
	if err := beforeCreate(ctx, &l); err != nil {
		return domain.Label{}, err
	}
	row, err := r.s.queries(ctx).CreateLabel(ctx, sqlcdb.CreateLabelParams{ProjectID: l.ProjectID, Name: l.Name, Color: l.Color})
	if err != nil {
		return domain.Label{}, mapError(err, "label", 0)
	}
	return domain.Label{ID: row.ID, ProjectID: row.ProjectID, Name: row.Name, Color: row.Color}, nil
}

// Get returns one label.
func (r *LabelRepo) Get(ctx context.Context, id int64) (domain.Label, error) {
	row, err := r.s.queries(ctx).GetLabel(ctx, id)
	if err != nil {
		return domain.Label{}, mapError(err, "label", id)
	}
	return domain.Label{ID: row.ID, ProjectID: row.ProjectID, Name: row.Name, Color: row.Color}, nil
}

// List returns a project's labels by name, with their task counts.
func (r *LabelRepo) List(ctx context.Context, projectID int64) ([]domain.Label, error) {
	rows, err := r.s.queries(ctx).ListLabels(ctx, projectID)
	if err != nil {
		return nil, mapError(err, "labels", 0)
	}
	out := make([]domain.Label, len(rows))
	for i, row := range rows {
		out[i] = domain.Label{ID: row.ID, ProjectID: row.ProjectID, Name: row.Name, Color: row.Color, TaskCount: row.TaskCount}
	}
	return out, nil
}

// ListForTasks returns the labels of many tasks from one query, grouped by task id.
func (r *LabelRepo) ListForTasks(ctx context.Context, taskIDs []int64) (map[int64][]domain.Label, error) {
	rows, err := r.s.queries(ctx).ListLabelsForTasks(ctx, taskIDs)
	if err != nil {
		return nil, mapError(err, "labels", 0)
	}
	out := make(map[int64][]domain.Label)
	for _, row := range rows {
		out[row.TaskID] = append(out[row.TaskID], domain.Label{ID: row.ID, Name: row.Name, Color: row.Color})
	}
	return out, nil
}

// LockTask holds the task's row lock until the transaction ends.
func (r *LabelRepo) LockTask(ctx context.Context, taskID int64) error {
	_, err := r.s.queries(ctx).LockTask(ctx, taskID)
	return mapError(err, "task", taskID)
}

// CountOnTask counts the labels a task carries.
func (r *LabelRepo) CountOnTask(ctx context.Context, taskID int64) (int64, error) {
	n, err := r.s.queries(ctx).CountTaskLabels(ctx, taskID)
	return n, mapError(err, "labels", 0)
}

// Attach puts a label on a task, and reports whether it was not there before.
func (r *LabelRepo) Attach(ctx context.Context, taskID, labelID int64) (bool, error) {
	n, err := r.s.queries(ctx).AddTaskLabel(ctx, sqlcdb.AddTaskLabelParams{TaskID: taskID, LabelID: labelID})
	if err != nil {
		return false, fmt.Errorf("attach label %d: %w", labelID, mapError(err, "label", labelID))
	}
	return n == 1, nil
}

// Detach takes a label off a task.
func (r *LabelRepo) Detach(ctx context.Context, taskID, labelID int64) error {
	err := r.s.queries(ctx).RemoveTaskLabel(ctx, sqlcdb.RemoveTaskLabelParams{TaskID: taskID, LabelID: labelID})
	return mapError(err, "label", labelID)
}
