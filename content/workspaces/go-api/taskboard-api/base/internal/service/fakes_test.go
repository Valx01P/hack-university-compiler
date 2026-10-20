package service_test

import (
	"context"
	"io"
	"log/slog"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"

	"example.com/taskboard/internal/auth"
	"example.com/taskboard/internal/clock"
	"example.com/taskboard/internal/domain"
	"example.com/taskboard/internal/service"
	"example.com/taskboard/internal/service/servicetest"
)

// fixedNow is the course's fixed clock, HU_FIXED_TIME.
var fixedNow = time.Date(2026, 10, 1, 9, 0, 0, 0, time.UTC)

// The seed's users, as the services see an actor.
var (
	ada      = domain.User{ID: 1, Name: "Ada Lovelace", Email: "ada@example.com", Role: domain.RoleAdmin}
	grace    = domain.User{ID: 2, Name: "Grace Hopper", Email: "grace@example.com", Role: domain.RoleMember}
	linus    = domain.User{ID: 3, Name: "Linus Torvalds", Email: "linus@example.com", Role: domain.RoleMember}
	margaret = domain.User{ID: 4, Name: "Margaret Hamilton", Email: "margaret@example.com", Role: domain.RoleMember}
)

// app is every service over one in-memory database holding the contract's seed, with
// the clock fixed and bcrypt at its lowest cost.
type app struct {
	db          *servicetest.DB
	auth        *service.AuthService
	projects    *service.ProjectService
	tasks       *service.TaskService
	comments    *service.CommentService
	watchers    *service.WatcherService
	attachments *service.AttachmentService
	commentsDB  service.CommentStore
}

func newApp(t *testing.T, hooks *service.Hooks) app {
	t.Helper()
	db := servicetest.Seeded()
	st := db.Stores()
	clk := clock.Fixed(fixedNow)
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	hasher, err := auth.NewHasher(bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	if hooks == nil {
		hooks = &service.Hooks{}
	}
	return app{
		db:          db,
		auth:        service.NewAuthService(st, hasher, auth.NewJWT([]byte("test secret, at least 32 bytes long"), clk), service.ModeSession, clk, log),
		projects:    service.NewProjectService(st, clk),
		tasks:       service.NewTaskService(st, hooks, clk, log),
		comments:    service.NewCommentService(st, clk),
		watchers:    service.NewWatcherService(st, clk, log),
		attachments: service.NewAttachmentService(st, clk, log),
		commentsDB:  st.Comments,
	}
}

// ctx is the context tests call services with.
func ctx(t *testing.T) context.Context { return t.Context() }
