package service

import (
	"context"
	"log/slog"

	"example.com/taskboard/internal/clock"
	"example.com/taskboard/internal/domain"
	"example.com/taskboard/internal/jobs"
)

// WatcherService manages who watches a task, the many-to-many feature the capstone's
// labels are built after: a join table (00006_watchers.sql), its queries
// (db/queries/watchers.sql), a repository (store/watchers.go), this service with its
// policy and an after-commit job, and the handlers (api/watchers.go).
//
// Whoever may see a task may list its watchers. Members may add and remove watchers,
// and only members of the task's project can watch it. Adding and removing are
// idempotent, so repeating a request changes nothing.
type WatcherService struct {
	st    Stores
	clock clock.Clock
	log   *slog.Logger
}

// NewWatcherService returns a WatcherService over st.
func NewWatcherService(st Stores, clk clock.Clock, log *slog.Logger) *WatcherService {
	return &WatcherService{st: st, clock: clk, log: log}
}

// List returns a task's watchers, sorted by user id.
func (s *WatcherService) List(ctx context.Context, actor domain.User, taskID int64) ([]domain.UserRef, error) {
	if _, err := s.editable(ctx, actor, taskID, false); err != nil {
		return nil, err
	}
	return s.st.Watchers.List(ctx, taskID)
}

// Watch makes userID watch a task. When someone adds another member, a watcher.added
// job tells that member once the change has committed.
func (s *WatcherService) Watch(ctx context.Context, actor domain.User, taskID, userID int64) error {
	t, err := s.editable(ctx, actor, taskID, true)
	if err != nil {
		return err
	}
	role, err := s.st.Projects.MemberRole(ctx, t.ProjectID, userID)
	if err != nil {
		return err
	}
	if role == "" {
		return domain.Invalid("user_id", "is not a member of this task's project")
	}
	return inTx(ctx, s.st.Tx, func(ctx context.Context) error {
		added, err := s.st.Watchers.Add(ctx, taskID, userID, s.clock.Now())
		if err != nil || !added || userID == actor.ID {
			return err
		}
		AfterCommit(ctx, func(ctx context.Context) {
			payload := jobs.WatcherAdded{TaskID: taskID, UserID: userID, By: actor.ID}
			if err := s.st.Jobs.Enqueue(ctx, jobs.KindWatcherAdded, payload, s.clock.Now()); err != nil {
				s.log.ErrorContext(ctx, "enqueue watcher.added", "task_id", taskID, "err", err)
			}
		})
		return nil
	})
}

// Unwatch makes userID stop watching a task.
func (s *WatcherService) Unwatch(ctx context.Context, actor domain.User, taskID, userID int64) error {
	if _, err := s.editable(ctx, actor, taskID, true); err != nil {
		return err
	}
	return s.st.Watchers.Remove(ctx, taskID, userID)
}

// editable loads a task the actor may see, and with write set, may change.
func (s *WatcherService) editable(ctx context.Context, actor domain.User, taskID int64, write bool) (domain.Task, error) {
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
	case write && !canEdit(a):
		return domain.Task{}, forbidden("only members of the project can change who watches a task")
	}
	return t, nil
}
