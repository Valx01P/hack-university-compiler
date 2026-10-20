package domain

import (
	"fmt"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

// MemberRole is what a user may do inside one project.
type MemberRole string

// The project roles. Owners change the project and delete tasks; members do the rest.
const (
	ProjectOwner  MemberRole = "owner"
	ProjectMember MemberRole = "member"
)

// ParseMemberRole accepts the roles a project member can have.
func ParseMemberRole(s string) (MemberRole, error) {
	switch r := MemberRole(s); r {
	case ProjectOwner, ProjectMember:
		return r, nil
	}
	return "", fmt.Errorf("unknown project role %q", s)
}

// DefaultProjectColor is the color of a project created without one.
const DefaultProjectColor = "#64748b"

var colorPattern = regexp.MustCompile(`^#[0-9a-f]{6}$`)

// Project groups tasks. Only its members see it, and an admin may read it too.
type Project struct {
	ID          int64
	OwnerID     int64
	Name        string
	Description *string
	Color       string
	CreatedAt   time.Time
}

// Normalize trims the name and description, drops an empty description, and
// lowercases the color, so "  Launch Plan " and "#F97316" are stored the same way
// as "Launch Plan" and "#f97316".
func (p *Project) Normalize() {
	p.Name = strings.TrimSpace(p.Name)
	if p.Description != nil {
		d := strings.TrimSpace(*p.Description)
		p.Description = &d
		if d == "" {
			p.Description = nil
		}
	}
	p.Color = strings.ToLower(strings.TrimSpace(p.Color))
}

// Validate checks the rules a project must always follow. Unique names per owner are
// the database's job (the projects_owner_name_key index).
func (p Project) Validate() error {
	errs := FieldErrors{}
	if n := utf8.RuneCountInString(p.Name); n < 3 || n > 100 {
		errs.Add("name", "must be 3 to 100 characters")
	}
	if p.Description != nil && utf8.RuneCountInString(*p.Description) > 500 {
		errs.Add("description", "must be at most 500 characters")
	}
	if !colorPattern.MatchString(p.Color) {
		errs.Add("color", "must be a color like #2563eb")
	}
	return errs.Err()
}

// Member is a user in a project, with their role there.
type Member struct {
	UserID int64
	Name   string
	Email  string
	Role   MemberRole
}

// ProjectSummary is one project in a user's list: the user's role in it and how many
// of its tasks are in each status.
type ProjectSummary struct {
	Project
	Role   MemberRole
	Counts TaskCounts
}

// TaskCounts counts a project's tasks by status.
type TaskCounts struct {
	Todo  int64
	Doing int64
	Done  int64
}
