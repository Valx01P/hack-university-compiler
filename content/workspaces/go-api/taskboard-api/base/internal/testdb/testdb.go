// Package testdb gives each integration test a real PostgreSQL schema of its own, with
// every migration applied, dropped again when the test ends. Tests run against the
// same database engine as production instead of mocks, in parallel, without seeing
// each other's rows or the development data.
//
// A schema per test, rather than a database per test, needs no CREATEDB privilege,
// which workspace database roles do not have. The connection's search_path points at
// the schema, so the app's unqualified table names find it.
package testdb

import (
	"cmp"
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

// URL is the database tests use: TEST_DATABASE_URL, or DATABASE_URL when that is not
// set. Tests never touch its public schema.
func URL() string {
	return cmp.Or(os.Getenv("TEST_DATABASE_URL"), os.Getenv("DATABASE_URL"))
}

// New returns a pool on a fresh, migrated schema for t. It skips t under -short and
// when no database is configured, so `go test -short ./...` runs without PostgreSQL.
func New(t testing.TB) *pgxpool.Pool {
	t.Helper()
	if testing.Short() {
		t.Skip("needs the database (skipped by -short)")
	}
	url := URL()
	if url == "" {
		t.Skip("needs the database: set TEST_DATABASE_URL or DATABASE_URL")
	}
	ctx := context.Background()
	schema := "test_" + strings.ToLower(rand.Text()[:16])
	if err := exec(ctx, url, "CREATE SCHEMA "+schema); err != nil {
		t.Fatalf("testdb: %v", err)
	}
	t.Cleanup(func() {
		if err := exec(context.Background(), url, "DROP SCHEMA "+schema+" CASCADE"); err != nil {
			t.Errorf("testdb: drop %s: %v", schema, err)
		}
	})

	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatalf("testdb: %v", err)
	}
	cfg.ConnConfig.RuntimeParams["search_path"] = schema
	cfg.MaxConns = 4
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatalf("testdb: %v", err)
	}
	t.Cleanup(pool.Close)
	if err := migrate(ctx, pool); err != nil {
		t.Fatalf("testdb: %v", err)
	}
	return pool
}

// Seed loads db/seed.sql, the Taskboard contract's rows, into t's schema.
func Seed(t testing.TB, pool *pgxpool.Pool) {
	t.Helper()
	root, err := moduleRoot()
	if err != nil {
		t.Fatalf("testdb: %v", err)
	}
	sql, err := os.ReadFile(filepath.Join(root, "db", "seed.sql")) //nolint:gosec // a file of this module
	if err != nil {
		t.Fatalf("testdb: %v", err)
	}
	if _, err := pool.Exec(context.Background(), string(sql), pgx.QueryExecModeSimpleProtocol); err != nil {
		t.Fatalf("testdb: load seed: %v", err)
	}
}

// exec runs one statement on its own connection.
func exec(ctx context.Context, url, sql string) error {
	conn, err := pgx.Connect(ctx, url)
	if err != nil {
		return err
	}
	defer func() { _ = conn.Close(ctx) }()
	_, err = conn.Exec(ctx, sql)
	return err
}

// migrate applies the migrations in db/migrations, read from disk so a test always
// sees the files as they are now, new ones included.
func migrate(ctx context.Context, pool *pgxpool.Pool) error {
	root, err := moduleRoot()
	if err != nil {
		return err
	}
	sqlDB := stdlib.OpenDBFromPool(pool)
	defer sqlDB.Close()
	provider, err := goose.NewProvider(goose.DialectPostgres, sqlDB, os.DirFS(filepath.Join(root, "db", "migrations")))
	if err != nil {
		return err
	}
	_, err = provider.Up(ctx)
	return err
}

// moduleRoot finds the folder holding go.mod, from the package directory a test runs in.
func moduleRoot() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", errors.New("go.mod not found above the test's directory")
		}
		dir = parent
	}
}

// Factories insert rows with plain SQL, so a test of one repository does not depend
// on the code of another. Each takes options for the fields a test cares about and
// fills in the rest.

// User is a row CreateUser made.
type User struct {
	ID    int64
	Email string
	Name  string
}

// UserOption changes one field of the user CreateUser makes.
type UserOption func(*User)

// WithEmail sets the user's email.
func WithEmail(email string) UserOption { return func(u *User) { u.Email = email } }

// WithName sets the user's name.
func WithName(name string) UserOption { return func(u *User) { u.Name = name } }

// CreateUser inserts a member account with a unique email.
func CreateUser(t testing.TB, pool *pgxpool.Pool, opts ...UserOption) User {
	t.Helper()
	tag := strings.ToLower(rand.Text()[:8])
	u := User{Email: tag + "@example.com", Name: "User " + tag}
	for _, opt := range opts {
		opt(&u)
	}
	err := pool.QueryRow(context.Background(),
		`INSERT INTO users (email, name, password_hash, created_at) VALUES ($1, $2, 'x', $3) RETURNING id`,
		u.Email, u.Name, Time).Scan(&u.ID)
	if err != nil {
		t.Fatalf("testdb: create user: %v", err)
	}
	return u
}

// CreateProject inserts a project owned by ownerID, who becomes its owner member, and
// adds members as members.
func CreateProject(t testing.TB, pool *pgxpool.Pool, ownerID int64, name string, members ...int64) int64 {
	t.Helper()
	ctx := context.Background()
	var id int64
	err := pool.QueryRow(ctx, `INSERT INTO projects (owner_id, name, created_at) VALUES ($1, $2, $3) RETURNING id`,
		ownerID, name, Time).Scan(&id)
	if err != nil {
		t.Fatalf("testdb: create project: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'owner')`, id, ownerID); err != nil {
		t.Fatalf("testdb: add owner: %v", err)
	}
	for _, m := range members {
		if _, err := pool.Exec(ctx, `INSERT INTO project_members (project_id, user_id) VALUES ($1, $2)`, id, m); err != nil {
			t.Fatalf("testdb: add member: %v", err)
		}
	}
	return id
}

// Task is the row CreateTask makes.
type Task struct {
	Title      string
	Status     string
	Priority   int
	DueOn      *time.Time
	AssigneeID *int64
	CreatedAt  time.Time
}

// TaskOption changes one field of the task CreateTask makes.
type TaskOption func(*Task)

// WithStatus sets the task's status (a done task also gets completed_at).
func WithStatus(status string) TaskOption { return func(t *Task) { t.Status = status } }

// WithAssignee sets the task's assignee, who must be a member of its project.
func WithAssignee(userID int64) TaskOption { return func(t *Task) { t.AssigneeID = &userID } }

// WithPriority sets the task's priority, 1 to 3.
func WithPriority(p int) TaskOption { return func(t *Task) { t.Priority = p } }

// WithDue sets the task's due date, as YYYY-MM-DD.
func WithDue(date string) TaskOption {
	return func(t *Task) {
		d, err := time.Parse(time.DateOnly, date)
		if err != nil {
			panic(fmt.Sprintf("testdb.WithDue(%q): %v", date, err))
		}
		t.DueOn = &d
	}
}

// WithCreatedAt sets when the task was created.
func WithCreatedAt(at time.Time) TaskOption { return func(t *Task) { t.CreatedAt = at } }

// CreateTask inserts a todo task of priority 2 in a project, and returns its id.
func CreateTask(t testing.TB, pool *pgxpool.Pool, projectID int64, title string, opts ...TaskOption) int64 {
	t.Helper()
	task := Task{Title: title, Status: "todo", Priority: 2, CreatedAt: Time}
	for _, opt := range opts {
		opt(&task)
	}
	var completed *time.Time
	if task.Status == "done" {
		completed = &task.CreatedAt
	}
	var id int64
	err := pool.QueryRow(context.Background(), `
		INSERT INTO tasks (project_id, title, status, priority, due_on, assignee_id, completed_at, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8) RETURNING id`,
		projectID, task.Title, task.Status, task.Priority, task.DueOn, task.AssigneeID, completed, task.CreatedAt).Scan(&id)
	if err != nil {
		t.Fatalf("testdb: create task: %v", err)
	}
	return id
}

// Time is the instant factories stamp rows with: the course's fixed clock.
var Time = time.Date(2026, 10, 1, 9, 0, 0, 0, time.UTC)
