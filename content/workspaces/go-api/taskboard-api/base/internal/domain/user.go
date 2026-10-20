package domain

import (
	"strings"
	"time"
)

// Role is what a user may do across the whole app. What a user may do inside one
// project is its MemberRole there.
type Role string

// The account roles. An admin may read every project.
const (
	RoleAdmin  Role = "admin"
	RoleMember Role = "member"
)

// User is someone who can log in. PasswordHash never leaves the server.
type User struct {
	ID           int64
	Email        string
	Name         string
	PasswordHash string
	Role         Role
	CreatedAt    time.Time
}

// IsAdmin reports whether the user may read every project.
func (u User) IsAdmin() bool { return u.Role == RoleAdmin }

// Ref is the user as other resources show them.
func (u User) Ref() UserRef { return UserRef{ID: u.ID, Name: u.Name} }

// UserRef is a user shown inside another resource: an id and a name, never an email.
type UserRef struct {
	ID   int64
	Name string
}

// NormalizeEmail trims and lowercases an email, so " Ada@Example.com" and
// "ada@example.com" are the same account.
func NormalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

// ValidEmail reports whether email looks like an address: one @, something before it,
// and a dot with something on both sides after it. Only sending mail proves more.
func ValidEmail(email string) bool {
	local, host, ok := strings.Cut(email, "@")
	if !ok || local == "" || strings.ContainsAny(email, " \t\r\n") || strings.Contains(host, "@") {
		return false
	}
	dot := strings.LastIndexByte(host, '.')
	return dot > 0 && dot < len(host)-1
}
