// Package domain holds Taskboard's models: users, projects, tasks, and comments, the
// rules that belong to them, and the errors every layer uses to say what went wrong.
// It imports nothing from the rest of the app, so any layer can depend on it.
package domain

import (
	"errors"
	"maps"
	"slices"
	"strconv"
	"strings"
)

// The sentinel errors. Stores and services wrap them with %w and a sentence for
// people ("task 999 not found"), and the API turns each into its HTTP status.
var (
	ErrNotFound        = errors.New("not found")
	ErrConflict        = errors.New("conflict")
	ErrForbidden       = errors.New("forbidden")
	ErrUnauthenticated = errors.New("unauthenticated")
	ErrPrecondition    = errors.New("precondition failed")
)

// ValidationError is input that breaks a rule, with a message per field to blame,
// such as {"title": "is required"}. The API answers it with 422.
type ValidationError struct {
	Fields map[string]string
}

func (e *ValidationError) Error() string { return joinFields(e.Fields) }

// ConflictError is a write that clashes with data that already exists, such as a
// taken email, with the fields to blame. errors.Is(err, ErrConflict) holds for it.
type ConflictError struct {
	Fields map[string]string
}

func (e *ConflictError) Error() string { return joinFields(e.Fields) }

// Is makes errors.Is(err, ErrConflict) true for a *ConflictError.
func (e *ConflictError) Is(target error) bool { return target == ErrConflict }

// StaleTaskError is an update made from an old version of a task. Current is the task
// as it is now, so a client can show what changed. errors.Is(err, ErrPrecondition) holds.
type StaleTaskError struct {
	Current Task
}

func (e *StaleTaskError) Error() string {
	return "the task changed since you read it: it is at version " + strconv.FormatInt(e.Current.Version, 10)
}

// Is makes errors.Is(err, ErrPrecondition) true for a *StaleTaskError.
func (e *StaleTaskError) Is(target error) bool { return target == ErrPrecondition }

// Invalid returns a *ValidationError for one field.
func Invalid(field, message string) error {
	return &ValidationError{Fields: map[string]string{field: message}}
}

// Conflict returns a *ConflictError for one field.
func Conflict(field, message string) error {
	return &ConflictError{Fields: map[string]string{field: message}}
}

// FieldErrors collects one message per field while a value is checked.
type FieldErrors map[string]string

// Add records message for field, keeping the first message a field gets.
func (f FieldErrors) Add(field, message string) {
	if _, ok := f[field]; !ok {
		f[field] = message
	}
}

// Err returns a *ValidationError holding the messages, or nil when there are none.
func (f FieldErrors) Err() error {
	if len(f) == 0 {
		return nil
	}
	return &ValidationError{Fields: f}
}

// joinFields writes {"title": "is required", "priority": "must be 1, 2, or 3"} as
// "priority must be 1, 2, or 3; title is required", sorted so the text never changes.
func joinFields(fields map[string]string) string {
	parts := make([]string, 0, len(fields))
	for _, field := range slices.Sorted(maps.Keys(fields)) {
		parts = append(parts, field+" "+fields[field])
	}
	return strings.Join(parts, "; ")
}
