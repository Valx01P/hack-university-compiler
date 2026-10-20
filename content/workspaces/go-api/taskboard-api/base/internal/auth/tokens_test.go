package auth

import (
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"

	"example.com/taskboard/internal/clock"
	"example.com/taskboard/internal/domain"
)

var (
	now    = time.Date(2026, 10, 1, 9, 0, 0, 0, time.UTC)
	secret = []byte("0123456789abcdef0123456789abcdef")
)

// sign makes a token with any claims and method, the way an attacker might.
func sign(t *testing.T, method jwt.SigningMethod, key any, claims jwt.RegisteredClaims) string {
	t.Helper()
	token, err := jwt.NewWithClaims(method, claims).SignedString(key)
	if err != nil {
		t.Fatal(err)
	}
	return token
}

func TestParseJWT(t *testing.T) {
	j := NewJWT(secret, clock.Fixed(now))
	valid := jwt.RegisteredClaims{
		Subject: "2", Issuer: Issuer, Audience: jwt.ClaimStrings{Audience},
		ExpiresAt: jwt.NewNumericDate(now.Add(time.Hour)),
	}
	issued, err := j.Issue(2, now.Add(time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	with := func(change func(c *jwt.RegisteredClaims)) jwt.RegisteredClaims {
		c := valid
		change(&c)
		return c
	}
	tests := []struct {
		name  string
		token string
		ok    bool
	}{
		{"issued by Issue", issued, true},
		{"valid", sign(t, jwt.SigningMethodHS256, secret, valid), true},
		{"expired", sign(t, jwt.SigningMethodHS256, secret, with(func(c *jwt.RegisteredClaims) { c.ExpiresAt = jwt.NewNumericDate(now.Add(-time.Minute)) })), false},
		{"no expiry", sign(t, jwt.SigningMethodHS256, secret, with(func(c *jwt.RegisteredClaims) { c.ExpiresAt = nil })), false},
		{"another audience", sign(t, jwt.SigningMethodHS256, secret, with(func(c *jwt.RegisteredClaims) { c.Audience = jwt.ClaimStrings{"billing-api"} })), false},
		{"another issuer", sign(t, jwt.SigningMethodHS256, secret, with(func(c *jwt.RegisteredClaims) { c.Issuer = "someone-else" })), false},
		{"another secret", sign(t, jwt.SigningMethodHS256, []byte("a different secret, 32 bytes long!"), valid), false},
		{"HS512", sign(t, jwt.SigningMethodHS512, secret, valid), false},
		{"alg none", sign(t, jwt.SigningMethodNone, jwt.UnsafeAllowNoneSignatureType, valid), false},
		{"tampered", issued[:len(issued)-2] + "xx", false},
		{"not a token", "not-a-token", false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			id, err := j.Parse(tc.token)
			if tc.ok && (err != nil || id != 2) {
				t.Errorf("Parse = %d, %v; want user 2", id, err)
			}
			if !tc.ok && (err == nil || !errors.Is(err, domain.ErrUnauthenticated)) {
				t.Errorf("Parse = %d, %v; want ErrUnauthenticated", id, err)
			}
		})
	}
}

func TestSessionTokens(t *testing.T) {
	a, b := NewSessionToken(), NewSessionToken()
	if len(a) != 26 || a == b {
		t.Errorf("tokens %q and %q: want two different 26-character tokens", a, b)
	}
	if h := HashToken(a); len(h) != 32 || string(h) == a {
		t.Errorf("HashToken gave %d bytes", len(h))
	}
}

func TestPasswords(t *testing.T) {
	h, err := NewHasher(bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	hash, err := h.Hash("correct horse battery staple")
	if err != nil || !strings.HasPrefix(hash, "$2a$04$") {
		t.Fatalf("Hash = %q, %v", hash, err)
	}
	for pw, want := range map[string]bool{"correct horse battery staple": true, "wrong horse battery staple": false} {
		if ok, err := h.Verify(hash, pw); ok != want || err != nil {
			t.Errorf("Verify(%q) = %v, %v", pw, ok, err)
		}
	}
	for pw, wantOK := range map[string]bool{"short pass1": false, strings.Repeat("x", 73): false, "hidden figures 1962": true} {
		if got := CheckPassword(pw) == ""; got != wantOK {
			t.Errorf("CheckPassword(%d characters) = %q", len(pw), CheckPassword(pw))
		}
	}
}
