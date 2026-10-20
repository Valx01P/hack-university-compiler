package service

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"
	"unicode/utf8"

	"example.com/taskboard/internal/auth"
	"example.com/taskboard/internal/clock"
	"example.com/taskboard/internal/domain"
)

// SessionTTL is how long a login lasts.
const SessionTTL = 24 * time.Hour

// AuthMode says what a login token is: an opaque session token looked up in the
// sessions table (the default), or a signed JWT checked without the database.
type AuthMode string

// The two auth modes, chosen by AUTH_MODE.
const (
	ModeSession AuthMode = "session"
	ModeJWT     AuthMode = "jwt"
)

// AuthService signs people up, logs them in and out, and tells who a token belongs to.
type AuthService struct {
	st     Stores
	hasher *auth.Hasher
	jwt    *auth.JWT
	mode   AuthMode
	clock  clock.Clock
	log    *slog.Logger
}

// NewAuthService returns an AuthService. jwt is used only in ModeJWT.
func NewAuthService(st Stores, hasher *auth.Hasher, jwt *auth.JWT, mode AuthMode, clk clock.Clock, log *slog.Logger) *AuthService {
	return &AuthService{st: st, hasher: hasher, jwt: jwt, mode: mode, clock: clk, log: log}
}

// errBadLogin is the one answer for an unknown email and a wrong password, so the
// answer never tells which emails have an account.
var errBadLogin = fmt.Errorf("%w: invalid email or password", domain.ErrUnauthenticated)

// Signup creates a member account. The email is normalized before it is checked and
// stored, so it is unique in any letter case, and only the password's bcrypt hash is
// kept.
func (s *AuthService) Signup(ctx context.Context, email, name, password string) (domain.User, error) {
	email = domain.NormalizeEmail(email)
	name = strings.TrimSpace(name)
	errs := domain.FieldErrors{}
	if !domain.ValidEmail(email) {
		errs.Add("email", "must be an email address such as ada@example.com")
	}
	if n := utf8.RuneCountInString(name); n < 1 || n > 50 {
		errs.Add("name", "must be 1 to 50 characters")
	}
	if msg := auth.CheckPassword(password); msg != "" {
		errs.Add("password", msg)
	}
	if err := errs.Err(); err != nil {
		return domain.User{}, err
	}
	hash, err := s.hasher.Hash(password)
	if err != nil {
		return domain.User{}, err
	}
	return s.st.Users.Create(ctx, domain.User{
		Email:        email,
		Name:         name,
		PasswordHash: hash,
		Role:         domain.RoleMember,
		CreatedAt:    s.clock.Now(),
	})
}

// Login is what a successful login returns.
type Login struct {
	Token     string
	ExpiresAt time.Time
	User      domain.User
}

// Login checks an email and password and returns a token that lasts SessionTTL. An
// unknown email costs the same bcrypt comparison as a wrong password.
func (s *AuthService) Login(ctx context.Context, email, password string) (Login, error) {
	email = domain.NormalizeEmail(email)
	errs := domain.FieldErrors{}
	if email == "" {
		errs.Add("email", "is required")
	}
	if password == "" {
		errs.Add("password", "is required")
	}
	if err := errs.Err(); err != nil {
		return Login{}, err
	}
	u, err := s.st.Users.GetByEmail(ctx, email)
	if errors.Is(err, domain.ErrNotFound) {
		s.hasher.VerifyNothing(password)
		return Login{}, errBadLogin
	}
	if err != nil {
		return Login{}, err
	}
	ok, err := s.hasher.Verify(u.PasswordHash, password)
	if err != nil {
		return Login{}, err
	}
	if !ok {
		return Login{}, errBadLogin
	}

	now := s.clock.Now()
	expires := now.Add(SessionTTL)
	if s.mode == ModeJWT {
		token, err := s.jwt.Issue(u.ID, expires)
		return Login{Token: token, ExpiresAt: expires, User: u}, err
	}
	token := auth.NewSessionToken()
	if err := s.st.Sessions.Create(ctx, auth.HashToken(token), u.ID, expires, now); err != nil {
		return Login{}, err
	}
	if n, err := s.st.Sessions.DeleteExpired(ctx, now); err != nil {
		s.log.WarnContext(ctx, "delete expired sessions", "err", err)
	} else if n > 0 {
		s.log.InfoContext(ctx, "expired sessions deleted", "count", n)
	}
	return Login{Token: token, ExpiresAt: expires, User: u}, nil
}

// Logout ends the session of token, so it stops working at once. A JWT cannot be
// ended early: it stays valid until it expires, which is the price of not storing it.
func (s *AuthService) Logout(ctx context.Context, token string) error {
	if s.mode == ModeJWT {
		return nil
	}
	return s.st.Sessions.Delete(ctx, auth.HashToken(token))
}

// Authenticate returns the user a token belongs to, or an error that is
// domain.ErrUnauthenticated when the token is unknown, expired, or forged.
func (s *AuthService) Authenticate(ctx context.Context, token string) (domain.User, error) {
	if s.mode == ModeJWT {
		id, err := s.jwt.Parse(token)
		if err != nil {
			return domain.User{}, err
		}
		u, err := s.st.Users.Get(ctx, id)
		if errors.Is(err, domain.ErrNotFound) {
			return domain.User{}, fmt.Errorf("%w: the token's user no longer exists", domain.ErrUnauthenticated)
		}
		return u, err
	}
	u, err := s.st.Sessions.User(ctx, auth.HashToken(token), s.clock.Now())
	if errors.Is(err, domain.ErrNotFound) {
		return domain.User{}, fmt.Errorf("%w: the session is unknown or expired", domain.ErrUnauthenticated)
	}
	return u, err
}
