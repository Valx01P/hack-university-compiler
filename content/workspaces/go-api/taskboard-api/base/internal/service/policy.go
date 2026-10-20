package service

import (
	"context"
	"fmt"

	"example.com/taskboard/internal/domain"
)

// access is what one user may do in one project: their role there ("" when they are
// not a member) and whether their account is an admin's.
type access struct {
	role  domain.MemberRole
	admin bool
}

// The policy, as small pure functions, so a table test can cover every role and action
// (policy_test.go). The rules:
//
//	                      owner  member  admin (not a member)  anyone else
//	view the project       yes    yes     yes                   no, 404
//	create, edit, move     yes    yes     no, 403               no, 404
//	tasks, comment, watch
//	delete tasks           yes    no      no, 403               no, 404
//	rename, add members    yes    no      no, 403               no, 404
//	delete a comment       yes    author  no, 403               no, 404
//
// Something you cannot view is a 404, never a 403, so guessing ids reveals nothing.

func canView(a access) bool { return a.role != "" || a.admin }

func canEdit(a access) bool { return a.role != "" }

func canDelete(a access) bool { return a.role == domain.ProjectOwner }

func canManageMembers(a access) bool { return a.role == domain.ProjectOwner }

func canDeleteComment(a access, authorID, userID int64) bool {
	return a.role == domain.ProjectOwner || (a.role != "" && authorID == userID)
}

// accessTo looks up what actor may do in a project.
func accessTo(ctx context.Context, projects ProjectStore, actor domain.User, projectID int64) (access, error) {
	role, err := projects.MemberRole(ctx, projectID, actor.ID)
	if err != nil {
		return access{}, err
	}
	return access{role: role, admin: actor.IsAdmin()}, nil
}

// forbidden is the error for something the user can see but may not do.
func forbidden(format string, args ...any) error {
	return fmt.Errorf("%w: %s", domain.ErrForbidden, fmt.Sprintf(format, args...))
}

// notFound is the error for something that does not exist, or that the user may not
// see. The two read the same on purpose.
func notFound(entity string, id int64) error {
	return fmt.Errorf("%s %d %w", entity, id, domain.ErrNotFound)
}
