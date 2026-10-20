package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"example.com/taskboard/internal/clock"
	"example.com/taskboard/internal/domain"
)

// NewSessionToken returns a fresh opaque token: 26 characters of crypto/rand base32,
// 130 bits that nobody can guess. The client keeps it, and the server keeps its hash.
func NewSessionToken() string { return rand.Text() }

// HashToken returns the SHA-256 of a session token, the only form the sessions table
// stores, so a copy of the database cannot be used to log in. A fast hash is right
// here: the token is already random, unlike a password.
func HashToken(token string) []byte {
	sum := sha256.Sum256([]byte(token))
	return sum[:]
}

// The claims every Taskboard JWT carries and every check demands.
const (
	Issuer   = "taskboard"
	Audience = "taskboard-api"
)

// JWT issues and checks HS256 tokens for AUTH_MODE=jwt. They need no database lookup,
// and for the same reason they cannot be revoked before they expire.
type JWT struct {
	secret []byte
	clock  clock.Clock
}

// NewJWT returns a JWT signer and checker for secret (TOKEN_SECRET).
func NewJWT(secret []byte, clk clock.Clock) *JWT {
	return &JWT{secret: secret, clock: clk}
}

// Issue signs a token for userID that expires at expires.
func (j *JWT) Issue(userID int64, expires time.Time) (string, error) {
	// TODO: sign jwt.RegisteredClaims (Subject, Issuer, Audience, IssuedAt, ExpiresAt)
	// with jwt.SigningMethodHS256 and j.secret.
	return "", errors.New("JWT.Issue is not written yet")
}

// Parse checks a token strictly and returns the user id it was issued for.
func (j *JWT) Parse(token string) (int64, error) {
	// TODO: jwt.ParseWithClaims with WithValidMethods (HS256 only), WithIssuer,
	// WithAudience, WithExpirationRequired, and WithTimeFunc(j.clock.Now). Every
	// failure is domain.ErrUnauthenticated.
	return 0, fmt.Errorf("%w: JWT.Parse is not written yet", domain.ErrUnauthenticated)
}

// IsExpired reports whether err came from a token that was fine except for its age,
// which clients may want to tell apart from a forged one.
func IsExpired(err error) bool { return errors.Is(err, jwt.ErrTokenExpired) }

type userKey struct{}

// WithUser returns a copy of ctx that carries the logged-in user. The requireAuth
// middleware calls it once per request.
func WithUser(ctx context.Context, u domain.User) context.Context {
	return context.WithValue(ctx, userKey{}, u)
}

// UserFrom returns the user WithUser stored, and false outside an authenticated request.
func UserFrom(ctx context.Context) (domain.User, bool) {
	u, ok := ctx.Value(userKey{}).(domain.User)
	return u, ok
}
