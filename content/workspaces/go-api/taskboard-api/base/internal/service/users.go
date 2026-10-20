package service

import (
	"context"

	"example.com/taskboard/internal/domain"
)

// MaxUserResults is the most users one search returns.
const MaxUserResults = 20

// UserService finds people, for example to add them to a project.
type UserService struct {
	st Stores
}

// NewUserService returns a UserService over st.
func NewUserService(st Stores) *UserService {
	return &UserService{st: st}
}

// Search returns up to 20 users whose name or email contains query, ignoring case,
// sorted by name and then id. An empty query lists everyone, so a team directory can
// show people before anyone types. Any logged-in user may search.
func (s *UserService) Search(ctx context.Context, actor domain.User, query string) ([]domain.User, error) {
	return s.st.Users.Search(ctx, query, MaxUserResults)
}
