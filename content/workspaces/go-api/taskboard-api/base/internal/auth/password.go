// Package auth holds the security primitives: password hashing, session tokens, JWTs,
// and carrying the logged-in user in a context. It knows nothing about HTTP or SQL.
package auth

import (
	"crypto/rand"
	"errors"
	"fmt"
	"unicode/utf8"

	"golang.org/x/crypto/bcrypt"
)

// Password rules. bcrypt reads at most 72 bytes, and x/crypto refuses longer
// passwords instead of silently ignoring the rest.
const (
	MinPasswordChars = 12
	MaxPasswordBytes = 72
)

// CheckPassword returns why a new password is not allowed, or "" when it is.
func CheckPassword(password string) string {
	switch {
	case utf8.RuneCountInString(password) < MinPasswordChars:
		return fmt.Sprintf("must be at least %d characters", MinPasswordChars)
	case len(password) > MaxPasswordBytes:
		return fmt.Sprintf("must be at most %d bytes", MaxPasswordBytes)
	}
	return ""
}

// Hasher hashes and verifies passwords with bcrypt at one cost (BCRYPT_COST). The cost
// is stored inside each hash, so raising it later still verifies old hashes.
type Hasher struct {
	cost  int
	dummy []byte
}

// NewHasher returns a Hasher for cost. It hashes one random password up front, which
// VerifyNothing compares against.
func NewHasher(cost int) (*Hasher, error) {
	dummy, err := bcrypt.GenerateFromPassword([]byte(rand.Text()), cost)
	if err != nil {
		return nil, fmt.Errorf("bcrypt cost %d: %w", cost, err)
	}
	return &Hasher{cost: cost, dummy: dummy}, nil
}

// Hash returns the bcrypt hash of password, a 60-character string like "$2a$10$...".
func (h *Hasher) Hash(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), h.cost)
	if err != nil {
		return "", fmt.Errorf("hash password: %w", err)
	}
	return string(hash), nil
}

// Verify reports whether password matches hash. A wrong password is (false, nil): only
// a hash that cannot be read is an error.
func (h *Hasher) Verify(hash, password string) (bool, error) {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	switch {
	case err == nil:
		return true, nil
	case errors.Is(err, bcrypt.ErrMismatchedHashAndPassword), errors.Is(err, bcrypt.ErrPasswordTooLong):
		return false, nil
	}
	return false, fmt.Errorf("verify password: %w", err)
}

// VerifyNothing spends the time a real Verify takes. Login calls it for an email that
// has no account, so a wrong email and a wrong password take the same time and nobody
// can find out which emails are registered by timing the answers.
func (h *Hasher) VerifyNothing(password string) {
	_ = bcrypt.CompareHashAndPassword(h.dummy, []byte(password))
}
