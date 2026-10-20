package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"example.com/taskboard/internal/domain"
	"example.com/taskboard/internal/store/sqlcdb"
)

// ProjectRepo is the PostgreSQL ProjectStore.
type ProjectRepo struct{ s *Store }

// NewProjectRepo returns the project repository of s.
func NewProjectRepo(s *Store) *ProjectRepo { return &ProjectRepo{s: s} }

// Get returns a project and userID's role in it, scoped in SQL: a user who is not a
// member (and not an admin) gets domain.ErrNotFound, exactly as for a missing project.
func (r *ProjectRepo) Get(ctx context.Context, projectID, userID int64, admin bool) (domain.Project, domain.MemberRole, error) {
	row, err := r.s.queries(ctx).GetProjectForMember(ctx, sqlcdb.GetProjectForMemberParams{
		ProjectID: projectID,
		UserID:    userID,
		IsAdmin:   admin,
	})
	if err != nil {
		return domain.Project{}, "", mapError(err, "project", projectID)
	}
	var role domain.MemberRole
	if row.MemberRole != nil {
		role = domain.MemberRole(*row.MemberRole)
	}
	p := domain.Project{
		ID:          row.ID,
		OwnerID:     row.OwnerID,
		Name:        row.Name,
		Description: row.Description,
		Color:       row.Color,
		CreatedAt:   tsFrom(row.CreatedAt),
	}
	return p, role, nil
}

// List returns the projects userID is a member of, with task counts.
func (r *ProjectRepo) List(ctx context.Context, userID int64) ([]domain.ProjectSummary, error) {
	rows, err := r.s.queries(ctx).ListProjectsForUser(ctx, userID)
	if err != nil {
		return nil, mapError(err, "projects", 0)
	}
	out := make([]domain.ProjectSummary, len(rows))
	for i, row := range rows {
		out[i] = domain.ProjectSummary{
			Project: domain.Project{
				ID:          row.ID,
				OwnerID:     row.OwnerID,
				Name:        row.Name,
				Description: row.Description,
				Color:       row.Color,
				CreatedAt:   tsFrom(row.CreatedAt),
			},
			Role:   domain.MemberRole(row.MemberRole),
			Counts: domain.TaskCounts{Todo: row.Todo, Doing: row.Doing, Done: row.Done},
		}
	}
	return out, nil
}

// Create inserts a project.
func (r *ProjectRepo) Create(ctx context.Context, p domain.Project) (domain.Project, error) {
	row, err := r.s.queries(ctx).CreateProject(ctx, sqlcdb.CreateProjectParams{
		OwnerID:     p.OwnerID,
		Name:        p.Name,
		Description: p.Description,
		Color:       p.Color,
		CreatedAt:   tsTo(p.CreatedAt),
	})
	if err != nil {
		return domain.Project{}, mapError(err, "project", 0)
	}
	return toDomainProject(row), nil
}

// Update saves a project's name, description, and color.
func (r *ProjectRepo) Update(ctx context.Context, p domain.Project) (domain.Project, error) {
	row, err := r.s.queries(ctx).RenameProject(ctx, sqlcdb.RenameProjectParams{
		ID:          p.ID,
		Name:        p.Name,
		Description: p.Description,
		Color:       p.Color,
	})
	if err != nil {
		return domain.Project{}, mapError(err, "project", p.ID)
	}
	return toDomainProject(row), nil
}

// AddMember adds a user to a project.
func (r *ProjectRepo) AddMember(ctx context.Context, projectID, userID int64, role domain.MemberRole, at time.Time) error {
	err := r.s.queries(ctx).AddMember(ctx, sqlcdb.AddMemberParams{
		ProjectID: projectID,
		UserID:    userID,
		Role:      string(role),
		CreatedAt: tsTo(at),
	})
	return mapError(err, "member", userID)
}

// ListMembers returns a project's members, sorted by user id.
func (r *ProjectRepo) ListMembers(ctx context.Context, projectID int64) ([]domain.Member, error) {
	rows, err := r.s.queries(ctx).ListMembers(ctx, projectID)
	if err != nil {
		return nil, mapError(err, "members", 0)
	}
	out := make([]domain.Member, len(rows))
	for i, row := range rows {
		out[i] = domain.Member{UserID: row.UserID, Name: row.Name, Email: row.Email, Role: domain.MemberRole(row.Role)}
	}
	return out, nil
}

// MemberRole returns userID's role in a project, or "" when it has none.
func (r *ProjectRepo) MemberRole(ctx context.Context, projectID, userID int64) (domain.MemberRole, error) {
	role, err := r.s.queries(ctx).MemberRole(ctx, sqlcdb.MemberRoleParams{ProjectID: projectID, UserID: userID})
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("member role: %w", err)
	}
	return domain.MemberRole(role), nil
}

func toDomainProject(row sqlcdb.Project) domain.Project {
	return domain.Project{
		ID:          row.ID,
		OwnerID:     row.OwnerID,
		Name:        row.Name,
		Description: row.Description,
		Color:       row.Color,
		CreatedAt:   tsFrom(row.CreatedAt),
	}
}
