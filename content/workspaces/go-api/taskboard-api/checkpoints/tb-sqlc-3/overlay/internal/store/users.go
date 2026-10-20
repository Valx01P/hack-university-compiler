package store

import (
	"context"

	"example.com/taskboard/internal/domain"
	"example.com/taskboard/internal/store/sqlcdb"
)

// UserRepo is the PostgreSQL UserStore.
type UserRepo struct{ s *Store }

// NewUserRepo returns the user repository of s.
func NewUserRepo(s *Store) *UserRepo { return &UserRepo{s: s} }

// Create inserts an account. A taken email (in any letter case) is a
// *domain.ConflictError for email, from the users_email_key index.
func (r *UserRepo) Create(ctx context.Context, u domain.User) (domain.User, error) {
	row, err := r.s.queries(ctx).CreateUser(ctx, sqlcdb.CreateUserParams{
		Email:        u.Email,
		Name:         u.Name,
		PasswordHash: u.PasswordHash,
		Role:         string(u.Role),
		CreatedAt:    tsTo(u.CreatedAt),
	})
	if err != nil {
		return domain.User{}, mapError(err, "user", 0)
	}
	return toDomainUser(row), nil
}

// Get returns one account.
func (r *UserRepo) Get(ctx context.Context, id int64) (domain.User, error) {
	row, err := r.s.queries(ctx).GetUserByID(ctx, id)
	if err != nil {
		return domain.User{}, mapError(err, "user", id)
	}
	return toDomainUser(row), nil
}

// GetByEmail returns the account with this email, in any letter case.
func (r *UserRepo) GetByEmail(ctx context.Context, email string) (domain.User, error) {
	row, err := r.s.queries(ctx).GetUserByEmail(ctx, email)
	if err != nil {
		return domain.User{}, mapError(err, "user", 0)
	}
	return toDomainUser(row), nil
}

// Search returns up to limit users whose name or email contains query.
func (r *UserRepo) Search(ctx context.Context, query string, limit int) ([]domain.User, error) {
	rows, err := r.s.queries(ctx).SearchUsers(ctx, sqlcdb.SearchUsersParams{
		Pattern:    likePattern(query),
		MaxResults: int32(limit),
	})
	if err != nil {
		return nil, mapError(err, "users", 0)
	}
	return mapUsers(rows), nil
}

// ListByIDs returns the users with these ids, in one query, sorted by id.
func (r *UserRepo) ListByIDs(ctx context.Context, ids []int64) ([]domain.User, error) {
	rows, err := r.s.queries(ctx).ListUsersByIDs(ctx, ids)
	if err != nil {
		return nil, mapError(err, "users", 0)
	}
	return mapUsers(rows), nil
}

func mapUsers(rows []sqlcdb.User) []domain.User {
	out := make([]domain.User, len(rows))
	for i, row := range rows {
		out[i] = toDomainUser(row)
	}
	return out
}

func toDomainUser(row sqlcdb.User) domain.User {
	return domain.User{
		ID:           row.ID,
		Email:        row.Email,
		Name:         row.Name,
		PasswordHash: row.PasswordHash,
		Role:         domain.Role(row.Role),
		CreatedAt:    tsFrom(row.CreatedAt),
	}
}
