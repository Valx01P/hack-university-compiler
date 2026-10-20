package service

import (
	"context"
	"log/slog"

	"example.com/taskboard/internal/clock"
	"example.com/taskboard/internal/domain"
	"example.com/taskboard/internal/jobs"
)

// TaskService is everything that can happen to a task: reading it, listing a
// project's tasks, creating, editing, moving between statuses, and deleting. Every
// method checks the policy first, and every write runs in a transaction.
type TaskService struct {
	st    Stores
	hooks *Hooks
	clock clock.Clock
	log   *slog.Logger
}

// NewTaskService returns a TaskService over st. hooks may be empty.
func NewTaskService(st Stores, hooks *Hooks, clk clock.Clock, log *slog.Logger) *TaskService {
	return &TaskService{st: st, hooks: hooks, clock: clk, log: log}
}

// Get returns a task the actor may see.
func (s *TaskService) Get(ctx context.Context, actor domain.User, id int64) (domain.Task, error) {
	t, _, err := s.load(ctx, actor, id)
	return t, err
}

// load reads a task and what actor may do in its project. A task the actor may not
// see is reported exactly like a task that does not exist.
func (s *TaskService) load(ctx context.Context, actor domain.User, id int64) (domain.Task, access, error) {
	t, err := s.st.Tasks.Get(ctx, id)
	if err != nil {
		return domain.Task{}, access{}, err
	}
	a, err := accessTo(ctx, s.st.Projects, actor, t.ProjectID)
	if err != nil {
		return domain.Task{}, access{}, err
	}
	if !canView(a) {
		return domain.Task{}, access{}, notFound("task", id)
	}
	return t, a, nil
}

// Include names the related data the task list can load along with each task.
type Include struct {
	Assignee bool
	Watchers bool
}

// TaskItem is a task in a list, with what Include asked for.
type TaskItem struct {
	domain.Task
	Assignee *domain.UserRef  // set when Include.Assignee and the task has an assignee
	Watchers []domain.UserRef // set when Include.Watchers
}

// TaskPage is one page of a project's tasks and how many tasks match in all.
type TaskPage struct {
	Items []TaskItem
	Total int64
}

// List returns one page of a project's tasks, with the related data Include asks for.
func (s *TaskService) List(ctx context.Context, actor domain.User, f domain.TaskFilter, inc Include) (TaskPage, error) {
	a, err := accessTo(ctx, s.st.Projects, actor, f.ProjectID)
	if err != nil {
		return TaskPage{}, err
	}
	if !canView(a) {
		return TaskPage{}, notFound("project", f.ProjectID)
	}
	tasks, total, err := s.st.Tasks.List(ctx, f)
	if err != nil {
		return TaskPage{}, err
	}
	items := make([]TaskItem, len(tasks))
	for i, t := range tasks {
		items[i].Task = t
		if inc.Assignee && t.AssigneeID != nil {
			u, err := s.st.Users.Get(ctx, *t.AssigneeID)
			if err != nil {
				return TaskPage{}, err
			}
			ref := u.Ref()
			items[i].Assignee = &ref
		}
		if inc.Watchers {
			watchers, err := s.st.Watchers.List(ctx, t.ID)
			if err != nil {
				return TaskPage{}, err
			}
			items[i].Watchers = watchers
		}
	}
	return TaskPage{Items: items, Total: total}, nil
}

// Create adds a task to a project. Members may create tasks, and the assignee, when
// there is one, must be a member too (the database's tasks_assignee_id_fkey).
func (s *TaskService) Create(ctx context.Context, actor domain.User, projectID int64, t domain.Task) (domain.Task, error) {
	a, err := accessTo(ctx, s.st.Projects, actor, projectID)
	if err != nil {
		return domain.Task{}, err
	}
	if !canView(a) {
		return domain.Task{}, notFound("project", projectID)
	}
	if !canEdit(a) {
		return domain.Task{}, forbidden("only members of the project can add tasks")
	}
	now := s.clock.Now()
	t.ProjectID = projectID
	t.CreatedAt, t.UpdatedAt = now, now
	if err := s.hooks.beforeCreateTask(ctx, &t); err != nil {
		return domain.Task{}, err
	}
	var created domain.Task
	err = inTx(ctx, s.st.Tx, func(ctx context.Context) error {
		created, err = s.st.Tasks.Create(ctx, t)
		if err != nil {
			return err
		}
		s.notifyAssignee(ctx, actor, nil, created)
		return nil
	})
	return created, err
}

// Update applies a PATCH to a task. version is the one the client last read (its
// If-Match): when someone changed the task since, the update fails with a
// *domain.StaleTaskError holding the task as it is now, instead of overwriting their
// change.
func (s *TaskService) Update(ctx context.Context, actor domain.User, id, version int64, patch domain.TaskPatch) (domain.Task, error) {
	var updated domain.Task
	err := inTx(ctx, s.st.Tx, func(ctx context.Context) error {
		t, a, err := s.load(ctx, actor, id)
		if err != nil {
			return err
		}
		if !canEdit(a) {
			return forbidden("only members of the project can edit its tasks")
		}
		if t.Version != version {
			return &domain.StaleTaskError{Current: t}
		}
		before := t
		patch.ApplyTo(&t)
		t.UpdatedAt = s.clock.Now()
		if err := s.hooks.beforeUpdateTask(ctx, &t); err != nil {
			return err
		}
		updated, err = s.st.Tasks.Update(ctx, t)
		if err != nil {
			return err
		}
		s.notifyAssignee(ctx, actor, before.AssigneeID, updated)
		return nil
	})
	return updated, err
}

// notifyAssignee queues a task.assigned job for after the commit when the task has a
// new assignee. Nothing is queued when the assignee did not change or the write rolls
// back.
func (s *TaskService) notifyAssignee(ctx context.Context, actor domain.User, before *int64, t domain.Task) {
	if t.AssigneeID == nil || (before != nil && *before == *t.AssigneeID) {
		return
	}
	payload := jobs.TaskAssigned{TaskID: t.ID, AssigneeID: *t.AssigneeID, By: actor.ID}
	AfterCommit(ctx, func(ctx context.Context) {
		if err := s.st.Jobs.Enqueue(ctx, jobs.KindTaskAssigned, payload, s.clock.Now()); err != nil {
			s.log.ErrorContext(ctx, "enqueue task.assigned", "task_id", t.ID, "err", err)
		}
	})
}

// Transition moves a task to another status under domain.CanTransition. Moving to
// done stamps completed_at and, in the same transaction, enqueues a task.completed
// job: the job exists if and only if the move was saved.
func (s *TaskService) Transition(ctx context.Context, actor domain.User, id int64, to string) (domain.Task, error) {
	status, err := domain.ParseStatus(to)
	if err != nil {
		return domain.Task{}, domain.Invalid("to", "must be todo, doing, or done")
	}
	var moved domain.Task
	err = inTx(ctx, s.st.Tx, func(ctx context.Context) error {
		t, a, err := s.load(ctx, actor, id)
		if err != nil {
			return err
		}
		if !canEdit(a) {
			return forbidden("only members of the project can move its tasks")
		}
		switch {
		case t.Status == status:
			return domain.Invalid("to", "is the status the task already has")
		case !domain.CanTransition(t.Status, status):
			return domain.Invalid("to", "a "+string(t.Status)+" task cannot move to "+string(status))
		}
		now := s.clock.Now()
		t.Status = status
		t.CompletedAt = nil
		if status == domain.StatusDone {
			t.CompletedAt = &now
		}
		t.UpdatedAt = now
		moved, err = s.st.Tasks.Transition(ctx, t)
		if err != nil {
			return err
		}
		if status == domain.StatusDone {
			return s.st.Jobs.Enqueue(ctx, jobs.KindTaskCompleted, jobs.TaskCompleted{TaskID: t.ID}, now)
		}
		return nil
	})
	return moved, err
}

// Delete removes a task, which only the project's owners may do. Its comments,
// watchers, and attachment rows go with it (ON DELETE CASCADE), and the attachment
// files are removed once the delete has committed.
func (s *TaskService) Delete(ctx context.Context, actor domain.User, id int64) error {
	return inTx(ctx, s.st.Tx, func(ctx context.Context) error {
		_, a, err := s.load(ctx, actor, id)
		if err != nil {
			return err
		}
		if !canDelete(a) {
			return forbidden("only project owners can delete tasks")
		}
		names, err := s.st.Attachments.ListStoredNames(ctx, id)
		if err != nil {
			return err
		}
		if err := s.st.Tasks.Delete(ctx, id); err != nil {
			return err
		}
		AfterCommit(ctx, func(ctx context.Context) {
			for _, name := range names {
				if err := s.st.Files.Remove(name); err != nil {
					s.log.WarnContext(ctx, "remove attachment file", "file", name, "err", err)
				}
			}
		})
		return nil
	})
}
