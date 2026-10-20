package servicetest

import (
	_ "embed"
	"encoding/json"
	"time"

	"golang.org/x/crypto/bcrypt"

	"example.com/taskboard/internal/domain"
)

// seedJSON is the Taskboard contract's seed, the same rows db/seed.sql loads.
//
//go:embed seed.json
var seedJSON []byte

// Password is every seed user's password.
const Password = "correct horse battery staple"

// Seeded returns a database holding the contract's seed: Ada (admin), Grace, Linus,
// and Margaret, projects 1 to 3, 18 tasks, 31 comments, and 6 watcher rows. Passwords
// are hashed at bcrypt's lowest cost, so logging in costs microseconds in tests.
func Seeded() *DB {
	var seed struct {
		Users []struct {
			ID        int64     `json:"id"`
			Name      string    `json:"name"`
			Email     string    `json:"email"`
			Role      string    `json:"role"`
			CreatedAt time.Time `json:"created_at"`
		} `json:"users"`
		Projects []struct {
			ID          int64     `json:"id"`
			Name        string    `json:"name"`
			Description *string   `json:"description"`
			Color       string    `json:"color"`
			OwnerID     int64     `json:"owner_id"`
			CreatedAt   time.Time `json:"created_at"`
		} `json:"projects"`
		Members []struct {
			ProjectID int64  `json:"project_id"`
			UserID    int64  `json:"user_id"`
			Role      string `json:"role"`
		} `json:"project_members"`
		Tasks []struct {
			ID          int64      `json:"id"`
			ProjectID   int64      `json:"project_id"`
			Title       string     `json:"title"`
			Description *string    `json:"description"`
			Status      string     `json:"status"`
			Priority    int        `json:"priority"`
			DueOn       *string    `json:"due_on"`
			AssigneeID  *int64     `json:"assignee_id"`
			Version     int64      `json:"version"`
			CompletedAt *time.Time `json:"completed_at"`
			CreatedAt   time.Time  `json:"created_at"`
			UpdatedAt   time.Time  `json:"updated_at"`
		} `json:"tasks"`
		Comments []struct {
			ID        int64     `json:"id"`
			TaskID    int64     `json:"task_id"`
			AuthorID  int64     `json:"author_id"`
			Body      string    `json:"body"`
			CreatedAt time.Time `json:"created_at"`
		} `json:"comments"`
		Watchers []struct {
			TaskID int64 `json:"task_id"`
			UserID int64 `json:"user_id"`
		} `json:"task_watchers"`
	}
	if err := json.Unmarshal(seedJSON, &seed); err != nil {
		panic("servicetest: seed.json: " + err.Error())
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(Password), bcrypt.MinCost)
	if err != nil {
		panic(err)
	}

	db := New()
	for _, u := range seed.Users {
		db.users[u.ID] = domain.User{ID: u.ID, Email: u.Email, Name: u.Name, PasswordHash: string(hash), Role: domain.Role(u.Role), CreatedAt: u.CreatedAt}
		db.nextID["users"] = max(db.nextID["users"], u.ID)
	}
	for _, p := range seed.Projects {
		db.projects[p.ID] = domain.Project{ID: p.ID, OwnerID: p.OwnerID, Name: p.Name, Description: p.Description, Color: p.Color, CreatedAt: p.CreatedAt}
		db.nextID["projects"] = max(db.nextID["projects"], p.ID)
	}
	for _, m := range seed.Members {
		if db.members[m.ProjectID] == nil {
			db.members[m.ProjectID] = map[int64]domain.MemberRole{}
		}
		db.members[m.ProjectID][m.UserID] = domain.MemberRole(m.Role)
	}
	for _, t := range seed.Tasks {
		task := domain.Task{
			ID: t.ID, ProjectID: t.ProjectID, Title: t.Title, Description: t.Description,
			Status: domain.Status(t.Status), Priority: domain.Priority(t.Priority), AssigneeID: t.AssigneeID,
			Version: t.Version, CompletedAt: t.CompletedAt, CreatedAt: t.CreatedAt, UpdatedAt: t.UpdatedAt,
		}
		if t.DueOn != nil {
			d, _ := time.Parse(time.DateOnly, *t.DueOn)
			task.DueOn = &d
		}
		db.tasks[t.ID] = task
		db.nextID["tasks"] = max(db.nextID["tasks"], t.ID)
	}
	for _, c := range seed.Comments {
		db.comments[c.ID] = domain.Comment{ID: c.ID, TaskID: c.TaskID, Author: domain.UserRef{ID: c.AuthorID}, Body: c.Body, CreatedAt: c.CreatedAt}
		db.nextID["comments"] = max(db.nextID["comments"], c.ID)
	}
	for _, w := range seed.Watchers {
		if db.watchers[w.TaskID] == nil {
			db.watchers[w.TaskID] = map[int64]bool{}
		}
		db.watchers[w.TaskID][w.UserID] = true
	}
	return db
}
