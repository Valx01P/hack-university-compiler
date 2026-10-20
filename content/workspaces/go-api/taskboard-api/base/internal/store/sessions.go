package store

import (
	"context"
	"time"

	"example.com/taskboard/internal/domain"
	"example.com/taskboard/internal/store/sqlcdb"
)

// SessionRepo is the PostgreSQL SessionStore.
type SessionRepo struct{ s *Store }

// NewSessionRepo returns the session repository of s.
func NewSessionRepo(s *Store) *SessionRepo { return &SessionRepo{s: s} }

// Create stores a session by its token's hash.
func (r *SessionRepo) Create(ctx context.Context, tokenHash []byte, userID int64, expiresAt, now time.Time) error {
	err := r.s.queries(ctx).CreateSession(ctx, sqlcdb.CreateSessionParams{
		TokenHash: tokenHash,
		UserID:    userID,
		ExpiresAt: expiresAt,
		CreatedAt: now,
	})
	return mapError(err, "session", 0)
}

// User returns the user of a session that has not expired at now.
func (r *SessionRepo) User(ctx context.Context, tokenHash []byte, now time.Time) (domain.User, error) {
	row, err := r.s.queries(ctx).GetSessionUser(ctx, sqlcdb.GetSessionUserParams{TokenHash: tokenHash, Now: now})
	if err != nil {
		return domain.User{}, mapError(err, "session", 0)
	}
	return toDomainUser(row), nil
}

// Delete ends a session.
func (r *SessionRepo) Delete(ctx context.Context, tokenHash []byte) error {
	return mapError(r.s.queries(ctx).DeleteSession(ctx, tokenHash), "session", 0)
}

// DeleteExpired removes every session that expired by now, and says how many.
func (r *SessionRepo) DeleteExpired(ctx context.Context, now time.Time) (int64, error) {
	n, err := r.s.queries(ctx).DeleteExpiredSessions(ctx, now)
	return n, mapError(err, "sessions", 0)
}
