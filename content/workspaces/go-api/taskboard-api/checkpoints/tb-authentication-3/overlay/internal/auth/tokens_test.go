package auth

import (
	"strings"
	"testing"

	"golang.org/x/crypto/bcrypt"
)

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
