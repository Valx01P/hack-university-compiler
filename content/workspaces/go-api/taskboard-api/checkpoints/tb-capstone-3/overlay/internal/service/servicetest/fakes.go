// Package servicetest is an in-memory Taskboard database for tests: a fake of every
// port the services need, built on maps and one mutex. The service and handler tests
// run on it without PostgreSQL, in microseconds, and the store's contract suite holds
// the fake TaskStore to the same rules as the real one, so the fakes cannot drift into
// lying. Seed loads the Taskboard contract's rows.
package servicetest

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"maps"
	"strings"
	"sync"
	"time"

	"example.com/taskboard/internal/domain"
	"example.com/taskboard/internal/service"
)

// DB holds every table in memory.
type DB struct {
	mu          sync.Mutex
	users       map[int64]domain.User
	projects    map[int64]domain.Project
	members     map[int64]map[int64]domain.MemberRole // project id, then user id
	tasks       map[int64]domain.Task
	comments    map[int64]domain.Comment
	watchers    map[int64]map[int64]bool // task id, then user id
	sessions    map[string]session       // by string(token hash)
	jobs        []Job
	attachments map[int64]domain.Attachment
	files       map[string][]byte
	labels      map[int64]domain.Label
	taskLabels  map[int64]map[int64]bool // task id, then label id
	nextID      map[string]int64
}

type session struct {
	userID    int64
	expiresAt time.Time
}

// Job is a job a service enqueued.
type Job struct {
	Kind    string
	Payload string // as JSON
	RunAt   time.Time
}

// New returns an empty database.
func New() *DB {
	return &DB{
		users:       map[int64]domain.User{},
		projects:    map[int64]domain.Project{},
		members:     map[int64]map[int64]domain.MemberRole{},
		tasks:       map[int64]domain.Task{},
		comments:    map[int64]domain.Comment{},
		watchers:    map[int64]map[int64]bool{},
		sessions:    map[string]session{},
		attachments: map[int64]domain.Attachment{},
		files:       map[string][]byte{},
		labels:      map[int64]domain.Label{},
		taskLabels:  map[int64]map[int64]bool{},
		nextID:      map[string]int64{},
	}
}

// Stores returns a fake for every port, all on db.
func (db *DB) Stores() service.Stores {
	return service.Stores{
		Tasks:       NewTaskStore(db),
		Projects:    projects{db},
		Users:       users{db},
		Comments:    comments{db},
		Watchers:    watchers{db},
		Sessions:    sessions{db},
		Jobs:        jobQueue{db},
		Attachments: attachments{db},
		Files:       files{db},
		Labels:      labels{db},
		Tx:          tx{db},
	}
}

// Jobs returns the jobs enqueued so far, oldest first.
func (db *DB) Jobs() []Job {
	db.mu.Lock()
	defer db.mu.Unlock()
	return append([]Job(nil), db.jobs...)
}

// AddSession stores a session for userID under token, the way a successful login
// would. Tests use it to act as a user without logging in.
func (db *DB) AddSession(token []byte, userID int64, expiresAt time.Time) {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.sessions[string(token)] = session{userID: userID, expiresAt: expiresAt}
}

func (db *DB) next(table string) int64 {
	db.nextID[table]++
	return db.nextID[table]
}

// tx is the fake TxRunner. A real transaction makes its writes all or nothing, so
// this one does too: it copies every table first and puts the copy back when fn fails.
type tx struct{ db *DB }

func (t tx) InTx(ctx context.Context, fn func(ctx context.Context) error) error {
	before := t.db.snapshot()
	if err := fn(ctx); err != nil {
		t.db.restore(before)
		return err
	}
	return nil
}

func (db *DB) snapshot() *DB {
	db.mu.Lock()
	defer db.mu.Unlock()
	c := &DB{
		users:       maps.Clone(db.users),
		projects:    maps.Clone(db.projects),
		members:     map[int64]map[int64]domain.MemberRole{},
		tasks:       maps.Clone(db.tasks),
		comments:    maps.Clone(db.comments),
		watchers:    map[int64]map[int64]bool{},
		sessions:    maps.Clone(db.sessions),
		jobs:        append([]Job(nil), db.jobs...),
		attachments: maps.Clone(db.attachments),
		files:       maps.Clone(db.files),
		labels:      maps.Clone(db.labels),
		taskLabels:  map[int64]map[int64]bool{},
		nextID:      maps.Clone(db.nextID),
	}
	for k, v := range db.taskLabels {
		c.taskLabels[k] = maps.Clone(v)
	}
	for k, v := range db.members {
		c.members[k] = maps.Clone(v)
	}
	for k, v := range db.watchers {
		c.watchers[k] = maps.Clone(v)
	}
	return c
}

func (db *DB) restore(c *DB) {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.users, db.projects, db.members, db.tasks = c.users, c.projects, c.members, c.tasks
	db.comments, db.watchers, db.sessions, db.jobs = c.comments, c.watchers, c.sessions, c.jobs
	db.attachments, db.files, db.nextID = c.attachments, c.files, c.nextID
	db.labels, db.taskLabels = c.labels, c.taskLabels
}

// notFound is the error the real stores give for a missing row.
func notFound(entity string, id int64) error {
	return fmt.Errorf("%s %d %w", entity, id, domain.ErrNotFound)
}

// projects is the fake ProjectStore.
type projects struct{ db *DB }

func (p projects) Get(ctx context.Context, projectID, userID int64, admin bool) (domain.Project, domain.MemberRole, error) {
	p.db.mu.Lock()
	defer p.db.mu.Unlock()
	project, ok := p.db.projects[projectID]
	role := p.db.members[projectID][userID]
	if !ok || (role == "" && !admin) {
		return domain.Project{}, "", notFound("project", projectID)
	}
	return project, role, nil
}

func (p projects) List(ctx context.Context, userID int64) ([]domain.ProjectSummary, error) {
	p.db.mu.Lock()
	defer p.db.mu.Unlock()
	var out []domain.ProjectSummary
	for _, id := range sortedKeys(p.db.projects) {
		role := p.db.members[id][userID]
		if role == "" {
			continue
		}
		s := domain.ProjectSummary{Project: p.db.projects[id], Role: role}
		for _, t := range p.db.tasks {
			if t.ProjectID == id {
				count(&s.Counts, t.Status)
			}
		}
		out = append(out, s)
	}
	return out, nil
}

func count(c *domain.TaskCounts, s domain.Status) {
	switch s {
	case domain.StatusTodo:
		c.Todo++
	case domain.StatusDoing:
		c.Doing++
	case domain.StatusDone:
		c.Done++
	}
}

func (p projects) Create(ctx context.Context, project domain.Project) (domain.Project, error) {
	p.db.mu.Lock()
	defer p.db.mu.Unlock()
	if p.db.nameTaken(project) {
		return domain.Project{}, domain.Conflict("name", "is already used by another of your projects")
	}
	project.ID = p.db.next("projects")
	p.db.projects[project.ID] = project
	return project, nil
}

func (p projects) Update(ctx context.Context, project domain.Project) (domain.Project, error) {
	p.db.mu.Lock()
	defer p.db.mu.Unlock()
	if _, ok := p.db.projects[project.ID]; !ok {
		return domain.Project{}, notFound("project", project.ID)
	}
	if p.db.nameTaken(project) {
		return domain.Project{}, domain.Conflict("name", "is already used by another of your projects")
	}
	p.db.projects[project.ID] = project
	return project, nil
}

// nameTaken is the projects_owner_name_key index: unique (owner_id, lower(name)).
func (db *DB) nameTaken(project domain.Project) bool {
	for _, other := range db.projects {
		if other.ID != project.ID && other.OwnerID == project.OwnerID && strings.EqualFold(other.Name, project.Name) {
			return true
		}
	}
	return false
}

func (p projects) AddMember(ctx context.Context, projectID, userID int64, role domain.MemberRole, at time.Time) error {
	p.db.mu.Lock()
	defer p.db.mu.Unlock()
	if _, ok := p.db.users[userID]; !ok {
		return domain.Invalid("user_id", "is not a user")
	}
	if p.db.members[projectID][userID] != "" {
		return domain.Conflict("user_id", "is already a member of this project")
	}
	if p.db.members[projectID] == nil {
		p.db.members[projectID] = map[int64]domain.MemberRole{}
	}
	p.db.members[projectID][userID] = role
	return nil
}

func (p projects) ListMembers(ctx context.Context, projectID int64) ([]domain.Member, error) {
	p.db.mu.Lock()
	defer p.db.mu.Unlock()
	out := []domain.Member{}
	for _, userID := range sortedKeys(p.db.members[projectID]) {
		u := p.db.users[userID]
		out = append(out, domain.Member{UserID: userID, Name: u.Name, Email: u.Email, Role: p.db.members[projectID][userID]})
	}
	return out, nil
}

func (p projects) MemberRole(ctx context.Context, projectID, userID int64) (domain.MemberRole, error) {
	p.db.mu.Lock()
	defer p.db.mu.Unlock()
	return p.db.members[projectID][userID], nil
}

// users is the fake UserStore.
type users struct{ db *DB }

func (u users) Create(ctx context.Context, user domain.User) (domain.User, error) {
	u.db.mu.Lock()
	defer u.db.mu.Unlock()
	for _, other := range u.db.users {
		if strings.EqualFold(other.Email, user.Email) {
			return domain.User{}, domain.Conflict("email", "is already registered")
		}
	}
	user.ID = u.db.next("users")
	u.db.users[user.ID] = user
	return user, nil
}

func (u users) Get(ctx context.Context, id int64) (domain.User, error) {
	u.db.mu.Lock()
	defer u.db.mu.Unlock()
	user, ok := u.db.users[id]
	if !ok {
		return domain.User{}, notFound("user", id)
	}
	return user, nil
}

func (u users) GetByEmail(ctx context.Context, email string) (domain.User, error) {
	u.db.mu.Lock()
	defer u.db.mu.Unlock()
	for _, user := range u.db.users {
		if strings.EqualFold(user.Email, email) {
			return user, nil
		}
	}
	return domain.User{}, fmt.Errorf("user %w", domain.ErrNotFound)
}

func (u users) Search(ctx context.Context, query string, limit int) ([]domain.User, error) {
	u.db.mu.Lock()
	defer u.db.mu.Unlock()
	q := strings.ToLower(query)
	var out []domain.User
	for _, id := range sortedKeys(u.db.users) {
		user := u.db.users[id]
		if strings.Contains(strings.ToLower(user.Name), q) || strings.Contains(strings.ToLower(user.Email), q) {
			out = append(out, user)
		}
	}
	sortBy(out, func(a, b domain.User) bool { return a.Name < b.Name || (a.Name == b.Name && a.ID < b.ID) })
	return out[:min(limit, len(out))], nil
}

func (u users) ListByIDs(ctx context.Context, ids []int64) ([]domain.User, error) {
	u.db.mu.Lock()
	defer u.db.mu.Unlock()
	var out []domain.User
	for _, id := range sortedKeys(u.db.users) {
		for _, want := range ids {
			if id == want {
				out = append(out, u.db.users[id])
				break
			}
		}
	}
	return out, nil
}

// comments is the fake CommentStore.
type comments struct{ db *DB }

func (c comments) List(ctx context.Context, taskID int64, after *domain.CommentCursor, limit int) ([]domain.Comment, error) {
	c.db.mu.Lock()
	defer c.db.mu.Unlock()
	var all []domain.Comment
	for _, cm := range c.db.comments {
		if cm.TaskID != taskID {
			continue
		}
		if after != nil && (cm.CreatedAt.Before(after.CreatedAt) || cm.CreatedAt.Equal(after.CreatedAt) && cm.ID <= after.ID) {
			continue
		}
		cm.Author.Name = c.db.users[cm.Author.ID].Name
		all = append(all, cm)
	}
	sortBy(all, func(a, b domain.Comment) bool {
		return a.CreatedAt.Before(b.CreatedAt) || a.CreatedAt.Equal(b.CreatedAt) && a.ID < b.ID
	})
	return all[:min(limit, len(all))], nil
}

func (c comments) Get(ctx context.Context, id int64) (domain.Comment, error) {
	c.db.mu.Lock()
	defer c.db.mu.Unlock()
	cm, ok := c.db.comments[id]
	if !ok {
		return domain.Comment{}, notFound("comment", id)
	}
	cm.Author.Name = c.db.users[cm.Author.ID].Name
	return cm, nil
}

func (c comments) Create(ctx context.Context, cm domain.Comment) (domain.Comment, error) {
	if err := beforeCreate(ctx, &cm); err != nil {
		return domain.Comment{}, err
	}
	c.db.mu.Lock()
	defer c.db.mu.Unlock()
	cm.ID = c.db.next("comments")
	cm.Author.Name = c.db.users[cm.Author.ID].Name
	c.db.comments[cm.ID] = cm
	return cm, nil
}

func (c comments) Delete(ctx context.Context, id int64) error {
	c.db.mu.Lock()
	defer c.db.mu.Unlock()
	if _, ok := c.db.comments[id]; !ok {
		return notFound("comment", id)
	}
	delete(c.db.comments, id)
	return nil
}

// watchers is the fake WatcherStore.
type watchers struct{ db *DB }

func (w watchers) List(ctx context.Context, taskID int64) ([]domain.UserRef, error) {
	w.db.mu.Lock()
	defer w.db.mu.Unlock()
	return w.db.watchersOf(taskID), nil
}

func (db *DB) watchersOf(taskID int64) []domain.UserRef {
	out := []domain.UserRef{}
	for _, userID := range sortedKeys(db.watchers[taskID]) {
		out = append(out, db.users[userID].Ref())
	}
	return out
}

func (w watchers) ListForTasks(ctx context.Context, taskIDs []int64) (map[int64][]domain.UserRef, error) {
	w.db.mu.Lock()
	defer w.db.mu.Unlock()
	out := map[int64][]domain.UserRef{}
	for _, id := range taskIDs {
		if refs := w.db.watchersOf(id); len(refs) > 0 {
			out[id] = refs
		}
	}
	return out, nil
}

func (w watchers) Add(ctx context.Context, taskID, userID int64, at time.Time) (bool, error) {
	w.db.mu.Lock()
	defer w.db.mu.Unlock()
	if _, ok := w.db.users[userID]; !ok {
		return false, domain.Invalid("user_id", "is not a user")
	}
	if w.db.watchers[taskID] == nil {
		w.db.watchers[taskID] = map[int64]bool{}
	}
	if w.db.watchers[taskID][userID] {
		return false, nil
	}
	w.db.watchers[taskID][userID] = true
	return true, nil
}

func (w watchers) Remove(ctx context.Context, taskID, userID int64) error {
	w.db.mu.Lock()
	defer w.db.mu.Unlock()
	delete(w.db.watchers[taskID], userID)
	return nil
}

// sessions is the fake SessionStore.
type sessions struct{ db *DB }

func (s sessions) Create(ctx context.Context, tokenHash []byte, userID int64, expiresAt, now time.Time) error {
	s.db.AddSession(tokenHash, userID, expiresAt)
	return nil
}

func (s sessions) User(ctx context.Context, tokenHash []byte, now time.Time) (domain.User, error) {
	s.db.mu.Lock()
	defer s.db.mu.Unlock()
	sess, ok := s.db.sessions[string(tokenHash)]
	if !ok || !sess.expiresAt.After(now) {
		return domain.User{}, fmt.Errorf("session %w", domain.ErrNotFound)
	}
	return s.db.users[sess.userID], nil
}

func (s sessions) Delete(ctx context.Context, tokenHash []byte) error {
	s.db.mu.Lock()
	defer s.db.mu.Unlock()
	delete(s.db.sessions, string(tokenHash))
	return nil
}

func (s sessions) DeleteExpired(ctx context.Context, now time.Time) (int64, error) {
	s.db.mu.Lock()
	defer s.db.mu.Unlock()
	var n int64
	for k, sess := range s.db.sessions {
		if !sess.expiresAt.After(now) {
			delete(s.db.sessions, k)
			n++
		}
	}
	return n, nil
}

// jobQueue is the fake JobQueue: it records what was enqueued.
type jobQueue struct{ db *DB }

func (j jobQueue) Enqueue(ctx context.Context, kind string, payload any, runAt time.Time) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	j.db.mu.Lock()
	defer j.db.mu.Unlock()
	j.db.jobs = append(j.db.jobs, Job{Kind: kind, Payload: string(data), RunAt: runAt})
	return nil
}

// attachments is the fake AttachmentStore.
type attachments struct{ db *DB }

func (a attachments) Create(ctx context.Context, att domain.Attachment) (domain.Attachment, error) {
	a.db.mu.Lock()
	defer a.db.mu.Unlock()
	att.ID = a.db.next("attachments")
	a.db.attachments[att.ID] = att
	return att, nil
}

func (a attachments) Get(ctx context.Context, id int64) (domain.Attachment, error) {
	a.db.mu.Lock()
	defer a.db.mu.Unlock()
	att, ok := a.db.attachments[id]
	if !ok {
		return domain.Attachment{}, notFound("attachment", id)
	}
	return att, nil
}

func (a attachments) ListStoredNames(ctx context.Context, taskID int64) ([]string, error) {
	a.db.mu.Lock()
	defer a.db.mu.Unlock()
	var names []string
	for _, id := range sortedKeys(a.db.attachments) {
		if att := a.db.attachments[id]; att.TaskID == taskID {
			names = append(names, att.StoredName)
		}
	}
	return names, nil
}

// files is the fake FileStore, holding files as byte slices.
type files struct{ db *DB }

func (f files) Save(r io.Reader, ext string) (string, int64, error) {
	data, err := io.ReadAll(r)
	if err != nil {
		return "", 0, err
	}
	f.db.mu.Lock()
	defer f.db.mu.Unlock()
	name := fmt.Sprintf("file%d%s", f.db.next("files"), ext)
	f.db.files[name] = data
	return name, int64(len(data)), nil
}

func (f files) Open(name string) (io.ReadSeekCloser, error) {
	f.db.mu.Lock()
	defer f.db.mu.Unlock()
	data, ok := f.db.files[name]
	if !ok {
		return nil, errors.New("no such file: " + name)
	}
	return nopCloser{bytes.NewReader(data)}, nil
}

func (f files) Remove(name string) error {
	f.db.mu.Lock()
	defer f.db.mu.Unlock()
	delete(f.db.files, name)
	return nil
}

type nopCloser struct{ *bytes.Reader }

func (nopCloser) Close() error { return nil }

// Files returns the names of the stored files.
func (db *DB) Files() []string {
	db.mu.Lock()
	defer db.mu.Unlock()
	return sortedKeys(db.files)
}
