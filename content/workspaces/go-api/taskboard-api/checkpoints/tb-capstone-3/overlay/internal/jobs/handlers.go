package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"example.com/taskboard/internal/clock"
	"example.com/taskboard/internal/domain"
)

// The job kinds, and the payload each one carries.
const (
	KindTaskAssigned  = "task.assigned"
	KindTaskCompleted = "task.completed"
	KindWatcherAdded  = "watcher.added"
	KindLabelAdded    = "label.added"
)

// TaskAssigned is queued after a task gets a new assignee.
type TaskAssigned struct {
	TaskID     int64 `json:"task_id"`
	AssigneeID int64 `json:"assignee_id"`
	By         int64 `json:"by"`
}

// TaskCompleted is queued in the same transaction that moves a task to done.
type TaskCompleted struct {
	TaskID int64 `json:"task_id"`
}

// WatcherAdded is queued after someone makes another member watch a task.
type WatcherAdded struct {
	TaskID int64 `json:"task_id"`
	UserID int64 `json:"user_id"`
	By     int64 `json:"by"`
}

// LabelAdded is queued after a label is put on a task.
type LabelAdded struct {
	TaskID  int64  `json:"task_id"`
	LabelID int64  `json:"label_id"`
	Label   string `json:"label"`
	By      int64  `json:"by"`
}

// Notifier is what the handlers need: read a task and its watchers, and write a row
// to notifications, which stands in for sending an email.
type Notifier interface {
	Task(ctx context.Context, id int64) (domain.Task, error)
	Watchers(ctx context.Context, taskID int64) ([]domain.UserRef, error)
	Notify(ctx context.Context, userID int64, kind string, payload any, at time.Time) error
}

// Handlers returns the handler of every job kind.
func Handlers(n Notifier, clk clock.Clock) map[string]Handler {
	return map[string]Handler{
		KindTaskAssigned: func(ctx context.Context, payload []byte) error {
			var p TaskAssigned
			if err := decode(payload, &p); err != nil {
				return err
			}
			t, err := n.Task(ctx, p.TaskID)
			if errors.Is(err, domain.ErrNotFound) {
				return nil // deleted since: nothing to tell anyone
			}
			if err != nil {
				return err
			}
			return n.Notify(ctx, p.AssigneeID, KindTaskAssigned, map[string]any{
				"task_id": t.ID, "title": t.Title, "priority": t.Priority.String(), "by": p.By,
			}, clk.Now())
		},
		KindTaskCompleted: func(ctx context.Context, payload []byte) error {
			var p TaskCompleted
			if err := decode(payload, &p); err != nil {
				return err
			}
			t, err := n.Task(ctx, p.TaskID)
			if errors.Is(err, domain.ErrNotFound) {
				return nil
			}
			if err != nil {
				return err
			}
			watchers, err := n.Watchers(ctx, t.ID)
			if err != nil {
				return err
			}
			for _, w := range watchers {
				err := n.Notify(ctx, w.ID, KindTaskCompleted, map[string]any{"task_id": t.ID, "title": t.Title}, clk.Now())
				if err != nil {
					return err
				}
			}
			return nil
		},
		KindLabelAdded: func(ctx context.Context, payload []byte) error {
			var p LabelAdded
			if err := decode(payload, &p); err != nil {
				return err
			}
			t, err := n.Task(ctx, p.TaskID)
			if errors.Is(err, domain.ErrNotFound) {
				return nil
			}
			if err != nil {
				return err
			}
			watchers, err := n.Watchers(ctx, t.ID)
			if err != nil {
				return err
			}
			for _, w := range watchers {
				err := n.Notify(ctx, w.ID, KindLabelAdded, map[string]any{"task_id": t.ID, "title": t.Title, "label": p.Label, "by": p.By}, clk.Now())
				if err != nil {
					return err
				}
			}
			return nil
		},
		KindWatcherAdded: func(ctx context.Context, payload []byte) error {
			var p WatcherAdded
			if err := decode(payload, &p); err != nil {
				return err
			}
			t, err := n.Task(ctx, p.TaskID)
			if errors.Is(err, domain.ErrNotFound) {
				return nil
			}
			if err != nil {
				return err
			}
			return n.Notify(ctx, p.UserID, KindWatcherAdded, map[string]any{
				"task_id": t.ID, "title": t.Title, "by": p.By,
			}, clk.Now())
		},
	}
}

func decode(payload []byte, v any) error {
	if err := json.Unmarshal(payload, v); err != nil {
		return fmt.Errorf("bad payload %s: %w", payload, err)
	}
	return nil
}
