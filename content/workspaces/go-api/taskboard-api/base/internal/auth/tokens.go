package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"errors"
	"fmt"
	"strconv"
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
	claims := jwt.RegisteredClaims{
		Subject:   strconv.FormatInt(userID, 10),
		Issuer:    Issuer,
		Audience:  jwt.ClaimStrings{Audience},
		IssuedAt:  jwt.NewNumericDate(j.clock.Now()),
		ExpiresAt: jwt.NewNumericDate(expires),
	}
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(j.secret)
	if err != nil {
		return "", fmt.Errorf("sign token: %w", err)
	}
	return token, nil
}

// Parse checks a token strictly, the way every JWT should be checked: HS256 only (so
// "alg": "none" and RS256 tokens fail), our issuer and audience, an expiry that must be
// present and in the future by our clock, and a valid signature. It returns the user id.
func (j *JWT) Parse(token string) (int64, error) {
	var claims jwt.RegisteredClaims
	_, err := jwt.ParseWithClaims(token, &claims,
		func(*jwt.Token) (any, error) { return j.secret, nil },
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithIssuer(Issuer),
		jwt.WithAudience(Audience),
		jwt.WithExpirationRequired(),
		jwt.WithTimeFunc(j.clock.Now),
	)
	if err != nil {
		return 0, fmt.Errorf("%w: %w", domain.ErrUnauthenticated, err)
	}
	id, err := strconv.ParseInt(claims.Subject, 10, 64)
	if err != nil || id < 1 {
		return 0, fmt.Errorf("%w: the token's subject is not a user id", domain.ErrUnauthenticated)
	}
	return id, nil
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
