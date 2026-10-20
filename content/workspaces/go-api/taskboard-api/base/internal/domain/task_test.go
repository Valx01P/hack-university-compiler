package domain

import (
	"errors"
	"strings"
	"testing"
)

func TestCanTransition(t *testing.T) {
	statuses := []Status{StatusTodo, StatusDoing, StatusDone}
	allowed := map[[2]Status]bool{
		{StatusTodo, StatusDoing}: true,
		{StatusTodo, StatusDone}:  true,
		{StatusDoing, StatusTodo}: true,
		{StatusDoing, StatusDone}: true,
		{StatusDone, StatusDoing}: true,
	}
	for _, from := range statuses {
		for _, to := range statuses {
			t.Run(string(from)+"_to_"+string(to), func(t *testing.T) {
				if got := CanTransition(from, to); got != allowed[[2]Status{from, to}] {
					t.Errorf("CanTransition(%s, %s) = %v", from, to, got)
				}
			})
		}
	}
}

func TestTaskBeforeCreate(t *testing.T) {
	task := Task{Title: "  Ship it  "}
	if err := task.BeforeCreate(t.Context()); err != nil {
		t.Fatalf("BeforeCreate: %v", err)
	}
	if task.Title != "Ship it" || task.Status != StatusTodo || task.Priority != PriorityMedium || task.Version != 1 {
		t.Errorf("after BeforeCreate: %+v", task)
	}
}

func TestTaskValidate(t *testing.T) {
	tests := []struct {
		name  string
		task  Task
		field string // "" when valid
	}{
		{"valid", Task{Title: "Ship it", Status: StatusTodo, Priority: PriorityLow}, ""},
		{"120 characters", Task{Title: strings.Repeat("é", 120), Status: StatusTodo, Priority: PriorityHigh}, ""},
		{"no title", Task{Status: StatusTodo, Priority: PriorityLow}, "title"},
		{"121 characters", Task{Title: strings.Repeat("x", 121), Status: StatusTodo, Priority: PriorityLow}, "title"},
		{"priority 0", Task{Title: "Ship it", Status: StatusTodo}, "priority"},
		{"an unknown status", Task{Title: "Ship it", Status: "blocked", Priority: PriorityLow}, "status"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.task.Validate()
			if tc.field == "" {
				if err != nil {
					t.Errorf("Validate: %v", err)
				}
				return
			}
			v, ok := errors.AsType[*ValidationError](err)
			if !ok || v.Fields[tc.field] == "" {
				t.Errorf("Validate = %v, want a message for %s", err, tc.field)
			}
		})
	}
}

func TestCommentBeforeCreate(t *testing.T) {
	tests := []struct {
		body, want string
		ok         bool
	}{
		{"  Looks good to me.  ", "Looks good to me.", true},
		{"line one\nline two", "line one\nline two", true},
		{"tab\there, bell\u0007 gone", "tabhere, bell gone", true},
		{"\u0007", "", false},
		{"   ", "", false},
		{strings.Repeat("x", 2001), "", false},
	}
	for _, tc := range tests {
		c := Comment{Body: tc.body}
		err := c.BeforeCreate(t.Context())
		if tc.ok && (err != nil || c.Body != tc.want) {
			t.Errorf("BeforeCreate(%q) = %q, %v; want %q", tc.body, c.Body, err, tc.want)
		}
		if !tc.ok && err == nil {
			t.Errorf("BeforeCreate(%q) accepted it", tc.body)
		}
	}
}

func TestErrorsReadWell(t *testing.T) {
	err := &ValidationError{Fields: map[string]string{"title": "is required", "priority": "must be 1, 2, or 3"}}
	if got := err.Error(); got != "priority must be 1, 2, or 3; title is required" {
		t.Errorf("Error() = %q", got)
	}
	if !errors.Is(Conflict("name", "is taken"), ErrConflict) {
		t.Error("a ConflictError is not ErrConflict")
	}
	if !errors.Is(&StaleTaskError{}, ErrPrecondition) {
		t.Error("a StaleTaskError is not ErrPrecondition")
	}
	if PriorityHigh.String() != "High" {
		t.Errorf("PriorityHigh.String() = %q", PriorityHigh.String())
	}
}
