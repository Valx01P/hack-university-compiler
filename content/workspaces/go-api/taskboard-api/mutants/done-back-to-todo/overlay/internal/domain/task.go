package domain

import (
	"context"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"
)

// Status is where a task is on the board.
type Status string

// The three statuses, the columns of the board.
const (
	StatusTodo  Status = "todo"
	StatusDoing Status = "doing"
	StatusDone  Status = "done"
)

// ParseStatus accepts the three statuses and nothing else, so a value read from the
// database or a request is checked once, here.
func ParseStatus(s string) (Status, error) {
	switch st := Status(s); st {
	case StatusTodo, StatusDoing, StatusDone:
		return st, nil
	}
	return "", fmt.Errorf("unknown status %q", s)
}

// CanTransition reports whether a task may move from one status to another: todo to
// doing or done, doing to todo or done, and done back to doing to reopen it. Done to
// todo, and a move to the status a task already has, are not allowed.
func CanTransition(from, to Status) bool {
	switch from {
	case StatusTodo:
		return to == StatusDoing || to == StatusDone
	case StatusDoing:
		return to == StatusTodo || to == StatusDone
	case StatusDone:
		return to == StatusDoing || to == StatusTodo
	}
	return false
}

// Priority is how urgent a task is. The wire carries the number, and String gives the
// word for logs and notifications.
type Priority int

//go:generate go tool stringer -type=Priority -trimprefix=Priority

// The three priorities, 1 to 3.
const (
	PriorityLow Priority = iota + 1
	PriorityMedium
	PriorityHigh
)

// Valid reports whether p is one of the three priorities.
func (p Priority) Valid() bool { return p >= PriorityLow && p <= PriorityHigh }

// Limits a task's text must stay within, counted in characters, not bytes.
const (
	MaxTaskTitle       = 120
	MaxTaskDescription = 2000
)

// Task is one card on a project's board. Version goes up by one with every change, and
// clients send it back in If-Match so two people's edits never silently overwrite each
// other. DueOn holds a date at midnight UTC.
type Task struct {
	ID          int64
	ProjectID   int64
	Title       string
	Description *string
	Status      Status
	Priority    Priority
	DueOn       *time.Time
	AssigneeID  *int64
	Version     int64
	CompletedAt *time.Time
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// BeforeCreate is the model's own hook: the store runs it before every INSERT. It trims
// the text, fills in the defaults a new task starts with, and refuses an invalid task,
// so no code path can store one.
func (t *Task) BeforeCreate(ctx context.Context) error {
	t.normalize()
	if t.Status == "" {
		t.Status = StatusTodo
	}
	if t.Priority == 0 {
		t.Priority = PriorityMedium
	}
	t.Version = 1
	return t.Validate()
}

// BeforeUpdate is the hook the store runs before every UPDATE of a task's fields.
func (t *Task) BeforeUpdate(ctx context.Context) error {
	t.normalize()
	return t.Validate()
}

func (t *Task) normalize() {
	t.Title = strings.TrimSpace(t.Title)
	if t.Description != nil {
		d := strings.TrimSpace(*t.Description)
		t.Description = &d
		if d == "" {
			t.Description = nil
		}
	}
}

// Validate checks every rule a stored task follows.
func (t Task) Validate() error {
	errs := FieldErrors{}
	switch n := utf8.RuneCountInString(t.Title); {
	case n == 0:
		errs.Add("title", "is required")
	case n > MaxTaskTitle:
		errs.Add("title", fmt.Sprintf("must be at most %d characters", MaxTaskTitle))
	}
	if t.Description != nil && utf8.RuneCountInString(*t.Description) > MaxTaskDescription {
		errs.Add("description", fmt.Sprintf("must be at most %d characters", MaxTaskDescription))
	}
	if _, err := ParseStatus(string(t.Status)); err != nil {
		errs.Add("status", "must be todo, doing, or done")
	}
	if !t.Priority.Valid() {
		errs.Add("priority", "must be 1, 2, or 3")
	}
	return errs.Err()
}

// Patch is one field of a partial update. A field whose Set is false keeps its value,
// so a PATCH can tell "leave due_on alone" from "clear due_on" (Set with a nil Value).
type Patch[T any] struct {
	Set   bool
	Value T
}

// Change returns a Patch that sets the field to v.
func Change[T any](v T) Patch[T] { return Patch[T]{Set: true, Value: v} }

// TaskPatch is a PATCH of a task: only the fields that are Set change. Status is not
// here on purpose: it changes only through a transition.
type TaskPatch struct {
	Title       Patch[string]
	Description Patch[*string]
	Priority    Patch[Priority]
	DueOn       Patch[*time.Time]
	AssigneeID  Patch[*int64]
}

// IsEmpty reports whether the patch changes nothing.
func (p TaskPatch) IsEmpty() bool {
	return !p.Title.Set && !p.Description.Set && !p.Priority.Set && !p.DueOn.Set && !p.AssigneeID.Set
}

// ApplyTo copies the fields that are Set onto t.
func (p TaskPatch) ApplyTo(t *Task) {
	if p.Title.Set {
		t.Title = p.Title.Value
	}
	if p.Description.Set {
		t.Description = p.Description.Value
	}
	if p.Priority.Set {
		t.Priority = p.Priority.Value
	}
	if p.DueOn.Set {
		t.DueOn = p.DueOn.Value
	}
	if p.AssigneeID.Set {
		t.AssigneeID = p.AssigneeID.Value
	}
}

// TaskSort is a column the task list may be ordered by. Only these four exist, so no
// text from a request ever reaches ORDER BY.
type TaskSort string

// The sort keys of the task list.
const (
	SortCreated  TaskSort = "created"
	SortDue      TaskSort = "due"
	SortPriority TaskSort = "priority"
	SortTitle    TaskSort = "title"
)

// ParseTaskSort accepts the four sort keys.
func ParseTaskSort(s string) (TaskSort, error) {
	switch k := TaskSort(s); k {
	case SortCreated, SortDue, SortPriority, SortTitle:
		return k, nil
	}
	return "", fmt.Errorf("unknown sort %q", s)
}

// TaskFilter selects, orders, and pages a project's tasks. Filters combine with AND,
// and ties in the order always break by id, so pages never overlap.
type TaskFilter struct {
	ProjectID  int64
	Status     *Status
	AssigneeID *int64
	Unassigned bool
	Query      string // matched against the title or description, ignoring case; "" for none
	Sort       TaskSort
	Desc       bool
	Limit      int
	Offset     int
}

// Attachment is a file uploaded to a task. StoredName is the random name it has in the
// upload folder, and OriginalName is what the uploader called it.
type Attachment struct {
	ID           int64
	TaskID       int64
	ProjectID    int64
	StoredName   string
	OriginalName string
	ContentType  string
	SizeBytes    int64
	CreatedAt    time.Time
}
