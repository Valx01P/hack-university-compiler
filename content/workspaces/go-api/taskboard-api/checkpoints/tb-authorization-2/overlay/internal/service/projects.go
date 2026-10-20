package service

import (
	"context"
	"errors"
	"fmt"
	"maps"
	"slices"

	"example.com/taskboard/internal/clock"
	"example.com/taskboard/internal/domain"
)

// ProjectService manages projects and their members. Anyone may create a project and
// becomes its owner. Members see it, and only owners change it.
type ProjectService struct {
	st    Stores
	clock clock.Clock
}

// NewProjectService returns a ProjectService over st.
func NewProjectService(st Stores, clk clock.Clock) *ProjectService {
	return &ProjectService{st: st, clock: clk}
}

// ProjectDetail is a project with its members, sorted by user id.
type ProjectDetail struct {
	domain.Project
	Members []domain.Member
}

// NewMember is a member to add while creating a project.
type NewMember struct {
	UserID int64
	Role   string
}

// List returns the projects the actor is a member of, sorted by id, with task counts.
// An admin's list holds only its own memberships too.
func (s *ProjectService) List(ctx context.Context, actor domain.User) ([]domain.ProjectSummary, error) {
	return s.st.Projects.List(ctx, actor.ID)
}

// Get returns a project the actor may see, with its members.
func (s *ProjectService) Get(ctx context.Context, actor domain.User, id int64) (ProjectDetail, error) {
	p, _, err := s.st.Projects.Get(ctx, id, actor.ID, actor.IsAdmin())
	if err != nil {
		return ProjectDetail{}, err
	}
	return s.withMembers(ctx, p)
}

func (s *ProjectService) withMembers(ctx context.Context, p domain.Project) (ProjectDetail, error) {
	members, err := s.st.Projects.ListMembers(ctx, p.ID)
	if err != nil {
		return ProjectDetail{}, err
	}
	return ProjectDetail{Project: p, Members: members}, nil
}

// Create makes a project owned by the actor, with an owner membership for them and the
// extra members asked for. It is all or nothing: the project, the owner, and every
// member are written in one transaction, so a bad member leaves no half-made project.
func (s *ProjectService) Create(ctx context.Context, actor domain.User, p domain.Project, members []NewMember) (ProjectDetail, error) {
	p.OwnerID = actor.ID
	p.CreatedAt = s.clock.Now()
	p.Normalize()
	if p.Color == "" {
		p.Color = domain.DefaultProjectColor
	}
	errs := fieldErrors(p.Validate())
	roles := make([]domain.MemberRole, len(members))
	seen := []int64{actor.ID}
	for i, m := range members {
		key := fmt.Sprintf("members[%d]", i)
		role, err := domain.ParseMemberRole(m.Role)
		if m.Role == "" {
			role, err = domain.ProjectMember, nil
		}
		if err != nil {
			errs.Add(key+".role", "must be owner or member")
		}
		if slices.Contains(seen, m.UserID) {
			errs.Add(key+".user_id", "is listed twice, or is you")
		}
		seen = append(seen, m.UserID)
		roles[i] = role
	}
	if err := errs.Err(); err != nil {
		return ProjectDetail{}, err
	}

	var detail ProjectDetail
	err := inTx(ctx, s.st.Tx, func(ctx context.Context) error {
		created, err := s.st.Projects.Create(ctx, p)
		if err != nil {
			return err
		}
		if err := s.st.Projects.AddMember(ctx, created.ID, actor.ID, domain.ProjectOwner, p.CreatedAt); err != nil {
			return err
		}
		for i, m := range members {
			if err := s.st.Projects.AddMember(ctx, created.ID, m.UserID, roles[i], p.CreatedAt); err != nil {
				return fieldIndexed(err, fmt.Sprintf("members[%d].", i))
			}
		}
		detail, err = s.withMembers(ctx, created)
		return err
	})
	return detail, err
}

// ProjectPatch is a PATCH of a project: only the fields that are Set change.
type ProjectPatch struct {
	Name        domain.Patch[string]
	Description domain.Patch[*string]
	Color       domain.Patch[string]
}

// Update renames or restyles a project. Only its owners may.
func (s *ProjectService) Update(ctx context.Context, actor domain.User, id int64, patch ProjectPatch) (ProjectDetail, error) {
	p, role, err := s.st.Projects.Get(ctx, id, actor.ID, actor.IsAdmin())
	if err != nil {
		return ProjectDetail{}, err
	}
	if !canManageMembers(access{role: role, admin: actor.IsAdmin()}) {
		return ProjectDetail{}, forbidden("only the project's owner can change it")
	}
	if patch.Name.Set {
		p.Name = patch.Name.Value
	}
	if patch.Description.Set {
		p.Description = patch.Description.Value
	}
	if patch.Color.Set {
		p.Color = patch.Color.Value
	}
	p.Normalize()
	if err := p.Validate(); err != nil {
		return ProjectDetail{}, err
	}
	updated, err := s.st.Projects.Update(ctx, p)
	if err != nil {
		return ProjectDetail{}, err
	}
	return s.withMembers(ctx, updated)
}

// AddMember adds a user to a project. Only owners may. role is "owner" or "member",
// and "" means member.
func (s *ProjectService) AddMember(ctx context.Context, actor domain.User, projectID, userID int64, role string) (domain.Member, error) {
	if _, _, err := s.st.Projects.Get(ctx, projectID, actor.ID, actor.IsAdmin()); err != nil {
		return domain.Member{}, err
	}
	var err error
	r := domain.ProjectMember
	if role != "" {
		if r, err = domain.ParseMemberRole(role); err != nil {
			return domain.Member{}, domain.Invalid("role", "must be owner or member")
		}
	}
	if err := s.st.Projects.AddMember(ctx, projectID, userID, r, s.clock.Now()); err != nil {
		return domain.Member{}, err
	}
	members, err := s.st.Projects.ListMembers(ctx, projectID)
	if err != nil {
		return domain.Member{}, err
	}
	for _, m := range members {
		if m.UserID == userID {
			return m, nil
		}
	}
	return domain.Member{}, notFound("member", userID)
}

// Stats counts a project's tasks by status.
func (s *ProjectService) Stats(ctx context.Context, actor domain.User, projectID int64) (domain.TaskCounts, error) {
	if _, _, err := s.st.Projects.Get(ctx, projectID, actor.ID, actor.IsAdmin()); err != nil {
		return domain.TaskCounts{}, err
	}
	return s.st.Tasks.CountByStatus(ctx, projectID)
}

// fieldErrors starts a FieldErrors with the fields of a *domain.ValidationError, so a
// method can add its own checks and report everything together.
func fieldErrors(err error) domain.FieldErrors {
	errs := domain.FieldErrors{}
	if v, ok := errors.AsType[*domain.ValidationError](err); ok {
		maps.Copy(errs, v.Fields)
	}
	return errs
}

// fieldIndexed prefixes the fields a store blamed, so an error about one of several
// members names which one: "user_id" becomes "members[1].user_id".
func fieldIndexed(err error, prefix string) error {
	prefixed := func(fields map[string]string) map[string]string {
		out := make(map[string]string, len(fields))
		for k, v := range fields {
			out[prefix+k] = v
		}
		return out
	}
	if v, ok := errors.AsType[*domain.ValidationError](err); ok {
		return &domain.ValidationError{Fields: prefixed(v.Fields)}
	}
	if c, ok := errors.AsType[*domain.ConflictError](err); ok {
		return &domain.ConflictError{Fields: prefixed(c.Fields)}
	}
	return err
}
