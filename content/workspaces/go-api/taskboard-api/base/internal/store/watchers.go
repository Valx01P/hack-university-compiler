package store

import (
	"context"
	"time"

	"example.com/taskboard/internal/domain"
	"example.com/taskboard/internal/store/sqlcdb"
)

// WatcherRepo is the PostgreSQL WatcherStore.
type WatcherRepo struct{ s *Store }

// NewWatcherRepo returns the watcher repository of s.
func NewWatcherRepo(s *Store) *WatcherRepo { return &WatcherRepo{s: s} }

// List returns a task's watchers, sorted by user id.
func (r *WatcherRepo) List(ctx context.Context, taskID int64) ([]domain.UserRef, error) {
	rows, err := r.s.queries(ctx).ListWatchers(ctx, taskID)
	if err != nil {
		return nil, mapError(err, "watchers", 0)
	}
	out := make([]domain.UserRef, len(rows))
	for i, row := range rows {
		out[i] = domain.UserRef{ID: row.ID, Name: row.Name}
	}
	return out, nil
}

// ListForTasks returns the watchers of many tasks from one query, grouped by task id.
func (r *WatcherRepo) ListForTasks(ctx context.Context, taskIDs []int64) (map[int64][]domain.UserRef, error) {
	rows, err := r.s.queries(ctx).ListWatchersForTasks(ctx, taskIDs)
	if err != nil {
		return nil, mapError(err, "watchers", 0)
	}
	out := make(map[int64][]domain.UserRef)
	for _, row := range rows {
		out[row.TaskID] = append(out[row.TaskID], domain.UserRef{ID: row.ID, Name: row.Name})
	}
	return out, nil
}

// Add makes a user watch a task, and reports whether they were not watching before.
func (r *WatcherRepo) Add(ctx context.Context, taskID, userID int64, at time.Time) (bool, error) {
	n, err := r.s.queries(ctx).AddWatcher(ctx, sqlcdb.AddWatcherParams{TaskID: taskID, UserID: userID, CreatedAt: at})
	if err != nil {
		return false, mapError(err, "watcher", userID)
	}
	return n == 1, nil
}

// Remove makes a user stop watching a task. Removing a non-watcher changes nothing.
func (r *WatcherRepo) Remove(ctx context.Context, taskID, userID int64) error {
	err := r.s.queries(ctx).RemoveWatcher(ctx, sqlcdb.RemoveWatcherParams{TaskID: taskID, UserID: userID})
	return mapError(err, "watcher", userID)
}
