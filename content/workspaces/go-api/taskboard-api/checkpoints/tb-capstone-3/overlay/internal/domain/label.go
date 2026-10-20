package domain

import (
	"context"
	"strings"
	"unicode/utf8"
)

// Label limits and defaults.
const (
	DefaultLabelColor = "#6b7280"
	MaxLabelsPerTask  = 5
	MaxLabelName      = 30
)

// Label is a name a project's members can put on its tasks. TaskCount is how many
// tasks carry it, filled in by List.
type Label struct {
	ID        int64
	ProjectID int64
	Name      string
	Color     string
	TaskCount int64
}

// BeforeCreate is the model's hook, run by the store before every INSERT: it trims the
// name, lowercases it, and collapses its runs of spaces, so "Needs  Review " and
// "needs review" are one label, and it fills in the default color.
func (l *Label) BeforeCreate(ctx context.Context) error {
	l.Name = strings.ToLower(strings.Join(strings.Fields(l.Name), " "))
	l.Color = strings.ToLower(strings.TrimSpace(l.Color))
	if l.Color == "" {
		l.Color = DefaultLabelColor
	}
	errs := FieldErrors{}
	if n := utf8.RuneCountInString(l.Name); n < 1 || n > MaxLabelName {
		errs.Add("name", "must be 1 to 30 characters")
	}
	if !colorPattern.MatchString(l.Color) {
		errs.Add("color", "must be a color like #f59e0b")
	}
	return errs.Err()
}
