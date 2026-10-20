package servicetest

import (
	"context"
	"strings"

	"example.com/taskboard/internal/domain"
)

// labels is the fake LabelStore.
type labels struct{ db *DB }

func (l labels) Create(ctx context.Context, label domain.Label) (domain.Label, error) {
	if err := beforeCreate(ctx, &label); err != nil {
		return domain.Label{}, err
	}
	l.db.mu.Lock()
	defer l.db.mu.Unlock()
	for _, other := range l.db.labels {
		if other.ProjectID == label.ProjectID && strings.EqualFold(other.Name, label.Name) {
			return domain.Label{}, domain.Conflict("name", "is already used by another label of this project")
		}
	}
	label.ID = l.db.next("labels")
	l.db.labels[label.ID] = label
	return label, nil
}

func (l labels) Get(ctx context.Context, id int64) (domain.Label, error) {
	l.db.mu.Lock()
	defer l.db.mu.Unlock()
	label, ok := l.db.labels[id]
	if !ok {
		return domain.Label{}, notFound("label", id)
	}
	return label, nil
}

func (l labels) List(ctx context.Context, projectID int64) ([]domain.Label, error) {
	l.db.mu.Lock()
	defer l.db.mu.Unlock()
	out := []domain.Label{}
	for _, id := range sortedKeys(l.db.labels) {
		label := l.db.labels[id]
		if label.ProjectID != projectID {
			continue
		}
		for _, carried := range l.db.taskLabels {
			if carried[id] {
				label.TaskCount++
			}
		}
		out = append(out, label)
	}
	sortBy(out, func(a, b domain.Label) bool { return a.Name < b.Name || (a.Name == b.Name && a.ID < b.ID) })
	return out, nil
}

func (l labels) ListForTasks(ctx context.Context, taskIDs []int64) (map[int64][]domain.Label, error) {
	l.db.mu.Lock()
	defer l.db.mu.Unlock()
	out := map[int64][]domain.Label{}
	for _, taskID := range taskIDs {
		for _, id := range sortedKeys(l.db.taskLabels[taskID]) {
			out[taskID] = append(out[taskID], l.db.labels[id])
		}
		sortBy(out[taskID], func(a, b domain.Label) bool { return a.Name < b.Name })
	}
	return out, nil
}

// LockTask has nothing to lock: the fake's mutex already runs one call at a time.
func (l labels) LockTask(ctx context.Context, taskID int64) error { return nil }

func (l labels) CountOnTask(ctx context.Context, taskID int64) (int64, error) {
	l.db.mu.Lock()
	defer l.db.mu.Unlock()
	return int64(len(l.db.taskLabels[taskID])), nil
}

func (l labels) Attach(ctx context.Context, taskID, labelID int64) (bool, error) {
	l.db.mu.Lock()
	defer l.db.mu.Unlock()
	if l.db.taskLabels[taskID] == nil {
		l.db.taskLabels[taskID] = map[int64]bool{}
	}
	if l.db.taskLabels[taskID][labelID] {
		return false, nil
	}
	l.db.taskLabels[taskID][labelID] = true
	return true, nil
}

func (l labels) Detach(ctx context.Context, taskID, labelID int64) error {
	l.db.mu.Lock()
	defer l.db.mu.Unlock()
	delete(l.db.taskLabels[taskID], labelID)
	return nil
}
