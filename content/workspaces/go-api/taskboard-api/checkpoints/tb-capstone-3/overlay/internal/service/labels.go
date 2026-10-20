package service

import (
	"context"
	"log/slog"

	"example.com/taskboard/internal/clock"
	"example.com/taskboard/internal/domain"
	"example.com/taskboard/internal/jobs"
)

// LabelService manages a project's labels and which tasks carry them, built the way
// WatcherService is. Its rules:
//
//   - Whoever may see a project may list its labels; its members may create them.
//   - Members may put a project's labels on its tasks and take them off. Both are
//     idempotent. A label from another project is a validation error for label_id.
//   - A task carries at most domain.MaxLabelsPerTask labels: a sixth is a conflict.
//     The count is taken inside the transaction, under the task's row lock, so two
//     requests cannot both add a fifth.
//   - Putting a label on a task queues a label.added job once the change has committed.
type LabelService struct {
	st    Stores
	clock clock.Clock
	log   *slog.Logger
}

// NewLabelService returns a LabelService over st.
func NewLabelService(st Stores, clk clock.Clock, log *slog.Logger) *LabelService {
	return &LabelService{st: st, clock: clk, log: log}
}

// Create adds a label to a project.
func (s *LabelService) Create(ctx context.Context, actor domain.User, projectID int64, name, color string) (domain.Label, error) {
	_, role, err := s.st.Projects.Get(ctx, projectID, actor.ID, actor.IsAdmin())
	if err != nil {
		return domain.Label{}, err
	}
	if !canEdit(access{role: role, admin: actor.IsAdmin()}) {
		return domain.Label{}, forbidden("only members of the project can create labels")
	}
	return s.st.Labels.Create(ctx, domain.Label{ProjectID: projectID, Name: name, Color: color})
}

// List returns a project's labels, sorted by name, with how many tasks carry each.
func (s *LabelService) List(ctx context.Context, actor domain.User, projectID int64) ([]domain.Label, error) {
	if _, _, err := s.st.Projects.Get(ctx, projectID, actor.ID, actor.IsAdmin()); err != nil {
		return nil, err
	}
	return s.st.Labels.List(ctx, projectID)
}

// Attach puts a label on a task.
func (s *LabelService) Attach(ctx context.Context, actor domain.User, taskID, labelID int64) error {
	t, err := s.editable(ctx, actor, taskID)
	if err != nil {
		return err
	}
	label, err := s.st.Labels.Get(ctx, labelID)
	if err != nil || label.ProjectID != t.ProjectID {
		return domain.Invalid("label_id", "is not a label of this task's project")
	}
	return inTx(ctx, s.st.Tx, func(ctx context.Context) error {
		if err := s.st.Labels.LockTask(ctx, taskID); err != nil {
			return err
		}
		added, err := s.st.Labels.Attach(ctx, taskID, labelID)
		if err != nil || !added {
			return err
		}
		n, err := s.st.Labels.CountOnTask(ctx, taskID)
		if err != nil {
			return err
		}
		if n > domain.MaxLabelsPerTask {
			return domain.Conflict("label_id", "would be the task's sixth label, and a task carries at most 5")
		}
		AfterCommit(ctx, func(ctx context.Context) {
			payload := jobs.LabelAdded{TaskID: taskID, LabelID: labelID, Label: label.Name, By: actor.ID}
			if err := s.st.Jobs.Enqueue(ctx, jobs.KindLabelAdded, payload, s.clock.Now()); err != nil {
				s.log.ErrorContext(ctx, "enqueue label.added", "task_id", taskID, "err", err)
			}
		})
		return nil
	})
}

// Detach takes a label off a task. Taking off a label the task does not carry changes
// nothing.
func (s *LabelService) Detach(ctx context.Context, actor domain.User, taskID, labelID int64) error {
	if _, err := s.editable(ctx, actor, taskID); err != nil {
		return err
	}
	return s.st.Labels.Detach(ctx, taskID, labelID)
}

// editable loads a task the actor may see and change.
func (s *LabelService) editable(ctx context.Context, actor domain.User, taskID int64) (domain.Task, error) {
	t, err := s.st.Tasks.Get(ctx, taskID)
	if err != nil {
		return domain.Task{}, err
	}
	a, err := accessTo(ctx, s.st.Projects, actor, t.ProjectID)
	if err != nil {
		return domain.Task{}, err
	}
	switch {
	case !canView(a):
		return domain.Task{}, notFound("task", taskID)
	case !canEdit(a):
		return domain.Task{}, forbidden("only members of the project can label its tasks")
	}
	return t, nil
}
