// Package service holds Taskboard's business rules: who may do what (policy.go), what
// happens around a write (hooks.go), and the use cases the API calls, one service per
// resource. Services speak in domain types and depend only on the interfaces below,
// which the store package implements for PostgreSQL and servicetest implements in
// memory for tests. The consumer declares the interface, so nothing here imports the
// store.
package service

import (
	"context"
	"io"
	"time"

	"example.com/taskboard/internal/domain"
)

// TaskStore keeps tasks. Like every store here, its methods run inside the
// transaction that ctx carries when they are called from TxRunner.InTx.
type TaskStore interface {
	Get(ctx context.Context, id int64) (domain.Task, error)
	// List returns one page of tasks and how many tasks match the filter in all.
	List(ctx context.Context, f domain.TaskFilter) ([]domain.Task, int64, error)
	CountByStatus(ctx context.Context, projectID int64) (domain.TaskCounts, error)
	Create(ctx context.Context, t domain.Task) (domain.Task, error)
	// Update saves t's fields if the stored task is still at t.Version, and returns it
	// at the next version. A stale version gives a *domain.StaleTaskError.
	Update(ctx context.Context, t domain.Task) (domain.Task, error)
	// Transition saves t's Status and CompletedAt, with the same version check.
	Transition(ctx context.Context, t domain.Task) (domain.Task, error)
	Delete(ctx context.Context, id int64) error
}

// ProjectStore keeps projects and their members.
type ProjectStore interface {
	// Get returns the project and userID's role in it (empty when not a member). A
	// user who is neither a member nor an admin gets domain.ErrNotFound, as if the
	// project did not exist.
	Get(ctx context.Context, projectID, userID int64, admin bool) (domain.Project, domain.MemberRole, error)
	List(ctx context.Context, userID int64) ([]domain.ProjectSummary, error)
	Create(ctx context.Context, p domain.Project) (domain.Project, error)
	Update(ctx context.Context, p domain.Project) (domain.Project, error)
	AddMember(ctx context.Context, projectID, userID int64, role domain.MemberRole, at time.Time) error
	ListMembers(ctx context.Context, projectID int64) ([]domain.Member, error)
	// MemberRole returns userID's role in the project, or "" when it has none.
	MemberRole(ctx context.Context, projectID, userID int64) (domain.MemberRole, error)
}

// UserStore keeps accounts.
type UserStore interface {
	Create(ctx context.Context, u domain.User) (domain.User, error)
	Get(ctx context.Context, id int64) (domain.User, error)
	GetByEmail(ctx context.Context, email string) (domain.User, error)
	// Search matches query against names and emails, ignoring case. An empty query
	// matches everyone. Results are sorted by name, then id.
	Search(ctx context.Context, query string, limit int) ([]domain.User, error)
	ListByIDs(ctx context.Context, ids []int64) ([]domain.User, error)
}

// CommentStore keeps comments.
type CommentStore interface {
	// List returns up to limit comments of a task, oldest first, starting after the
	// cursor (from the beginning when it is nil).
	List(ctx context.Context, taskID int64, after *domain.CommentCursor, limit int) ([]domain.Comment, error)
	Get(ctx context.Context, id int64) (domain.Comment, error)
	Create(ctx context.Context, c domain.Comment) (domain.Comment, error)
	Delete(ctx context.Context, id int64) error
}

// WatcherStore keeps who watches which task.
type WatcherStore interface {
	List(ctx context.Context, taskID int64) ([]domain.UserRef, error)
	// ListForTasks loads the watchers of many tasks in one query, keyed by task id.
	ListForTasks(ctx context.Context, taskIDs []int64) (map[int64][]domain.UserRef, error)
	// Add reports whether the user was not watching before.
	Add(ctx context.Context, taskID, userID int64, at time.Time) (bool, error)
	Remove(ctx context.Context, taskID, userID int64) error
}

// SessionStore keeps login sessions by the SHA-256 of their token.
type SessionStore interface {
	Create(ctx context.Context, tokenHash []byte, userID int64, expiresAt, now time.Time) error
	// User returns the user a session belongs to, or domain.ErrNotFound when there is
	// no such session or it expired before now.
	User(ctx context.Context, tokenHash []byte, now time.Time) (domain.User, error)
	Delete(ctx context.Context, tokenHash []byte) error
	DeleteExpired(ctx context.Context, now time.Time) (int64, error)
}

// JobQueue stores background jobs for the worker. Enqueued inside a transaction, a job
// exists only if the transaction commits.
type JobQueue interface {
	Enqueue(ctx context.Context, kind string, payload any, runAt time.Time) error
}

// AttachmentStore keeps the metadata of uploaded files.
type AttachmentStore interface {
	Create(ctx context.Context, a domain.Attachment) (domain.Attachment, error)
	Get(ctx context.Context, id int64) (domain.Attachment, error)
	ListStoredNames(ctx context.Context, taskID int64) ([]string, error)
}

// FileStore keeps the bytes of uploaded files.
type FileStore interface {
	// Save writes r to a new file with a random name ending in ext.
	Save(r io.Reader, ext string) (name string, size int64, err error)
	Open(name string) (io.ReadSeekCloser, error)
	Remove(name string) error
}

// TxRunner runs fn in one database transaction: it commits when fn returns nil and
// rolls back otherwise. Every store call made with the ctx fn receives joins the
// transaction. fn may run more than once when PostgreSQL asks for a retry, so work
// outside the database belongs in AfterCommit.
type TxRunner interface {
	InTx(ctx context.Context, fn func(ctx context.Context) error) error
}

// Stores is every port the services use. run.go fills it with the PostgreSQL stores,
// and tests with servicetest's fakes.
type Stores struct {
	Tasks       TaskStore
	Projects    ProjectStore
	Users       UserStore
	Comments    CommentStore
	Watchers    WatcherStore
	Sessions    SessionStore
	Jobs        JobQueue
	Attachments AttachmentStore
	Files       FileStore
	Tx          TxRunner
}
