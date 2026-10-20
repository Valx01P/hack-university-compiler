package api

import (
	"encoding/base64"
	"encoding/json"
	"log/slog"
	"strconv"
	"time"

	"example.com/taskboard/internal/domain"
	"example.com/taskboard/internal/service"
)

// The views of the MVC split: the exact JSON the Taskboard contract defines
// (contracts/taskboard/openapi.yaml), with snake_case names, RFC 3339 times in UTC,
// dates as YYYY-MM-DD, and [] instead of null for empty lists. Domain types never
// reach the wire directly, so a field added to a model (such as a password hash)
// cannot leak by accident, and the wire format cannot change by accident either.

type userResponse struct {
	ID        int64     `json:"id"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
}

func toUserResponse(u domain.User) userResponse {
	return userResponse{ID: u.ID, Email: u.Email, Name: u.Name, Role: string(u.Role), CreatedAt: u.CreatedAt.UTC()}
}

// userSummary is a search result: enough to pick someone, with their email.
type userSummary struct {
	ID    int64  `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
}

// userRef is a user inside another resource. It never carries an email.
type userRef struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

func toUserRefs(refs []domain.UserRef) []userRef {
	out := make([]userRef, len(refs))
	for i, u := range refs {
		out[i] = userRef{ID: u.ID, Name: u.Name}
	}
	return out
}

type loginResponse struct {
	Token     string       `json:"token"`
	ExpiresAt time.Time    `json:"expires_at"`
	User      userResponse `json:"user"`
}

type taskCounts struct {
	Todo  int64 `json:"todo"`
	Doing int64 `json:"doing"`
	Done  int64 `json:"done"`
}

func toTaskCounts(c domain.TaskCounts) taskCounts {
	return taskCounts{Todo: c.Todo, Doing: c.Doing, Done: c.Done}
}

type projectListItem struct {
	ID          int64      `json:"id"`
	Name        string     `json:"name"`
	Description *string    `json:"description"`
	Color       string     `json:"color"`
	OwnerID     int64      `json:"owner_id"`
	Role        string     `json:"role"`
	TaskCounts  taskCounts `json:"task_counts"`
	CreatedAt   time.Time  `json:"created_at"`
}

type projectResponse struct {
	ID          int64            `json:"id"`
	Name        string           `json:"name"`
	Description *string          `json:"description"`
	Color       string           `json:"color"`
	OwnerID     int64            `json:"owner_id"`
	CreatedAt   time.Time        `json:"created_at"`
	Members     []memberResponse `json:"members"`
}

type memberResponse struct {
	UserID int64  `json:"user_id"`
	Name   string `json:"name"`
	Email  string `json:"email"`
	Role   string `json:"role"`
}

func toMemberResponse(m domain.Member) memberResponse {
	return memberResponse{UserID: m.UserID, Name: m.Name, Email: m.Email, Role: string(m.Role)}
}

func toProjectResponse(d service.ProjectDetail) projectResponse {
	members := make([]memberResponse, len(d.Members))
	for i, m := range d.Members {
		members[i] = toMemberResponse(m)
	}
	return projectResponse{
		ID:          d.ID,
		Name:        d.Name,
		Description: d.Description,
		Color:       d.Color,
		OwnerID:     d.OwnerID,
		CreatedAt:   d.CreatedAt.UTC(),
		Members:     members,
	}
}

type taskResponse struct {
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

	// With ?include= on the task list only. omitzero leaves out a nil field but keeps
	// an empty list, so include=watchers gives "watchers": [] for a task nobody
	// watches, where omitempty would drop the key.
	Assignee *userRef  `json:"assignee,omitzero"`
	Watchers []userRef `json:"watchers,omitzero"`
}

func toTaskResponse(t domain.Task) taskResponse {
	resp := taskResponse{
		ID:          t.ID,
		ProjectID:   t.ProjectID,
		Title:       t.Title,
		Description: t.Description,
		Status:      string(t.Status),
		Priority:    int(t.Priority),
		AssigneeID:  t.AssigneeID,
		Version:     t.Version,
		CreatedAt:   t.CreatedAt.UTC(),
		UpdatedAt:   t.UpdatedAt.UTC(),
	}
	if t.DueOn != nil {
		d := t.DueOn.Format(time.DateOnly)
		resp.DueOn = &d
	}
	if t.CompletedAt != nil {
		c := t.CompletedAt.UTC()
		resp.CompletedAt = &c
	}
	return resp
}

func toTaskItem(item service.TaskItem, inc service.Include) taskResponse {
	resp := toTaskResponse(item.Task)
	if inc.Assignee && item.Assignee != nil {
		resp.Assignee = &userRef{ID: item.Assignee.ID, Name: item.Assignee.Name}
	}
	if inc.Watchers {
		resp.Watchers = toUserRefs(item.Watchers)
	}
	return resp
}

// taskPage is the task list's envelope. Total counts every task that matches the
// filters, not only this page, so a client can draw page links.
type taskPage struct {
	Items  []taskResponse `json:"items"`
	Total  int64          `json:"total"`
	Limit  int            `json:"limit"`
	Offset int            `json:"offset"`
}

type commentResponse struct {
	ID        int64     `json:"id"`
	TaskID    int64     `json:"task_id"`
	Author    userRef   `json:"author"`
	Body      string    `json:"body"`
	CreatedAt time.Time `json:"created_at"`
}

func toCommentResponse(c domain.Comment) commentResponse {
	return commentResponse{
		ID:        c.ID,
		TaskID:    c.TaskID,
		Author:    userRef{ID: c.Author.ID, Name: c.Author.Name},
		Body:      c.Body,
		CreatedAt: c.CreatedAt.UTC(),
	}
}

// commentPage is one page of comments. NextCursor is null on the last page.
type commentPage struct {
	Items      []commentResponse `json:"items"`
	NextCursor *string           `json:"next_cursor"`
}

type attachmentResponse struct {
	ID          int64     `json:"id"`
	TaskID      int64     `json:"task_id"`
	Name        string    `json:"name"`
	ContentType string    `json:"content_type"`
	SizeBytes   int64     `json:"size_bytes"`
	CreatedAt   time.Time `json:"created_at"`
}

func toAttachmentResponse(a domain.Attachment) attachmentResponse {
	return attachmentResponse{
		ID:          a.ID,
		TaskID:      a.TaskID,
		Name:        a.OriginalName,
		ContentType: a.ContentType,
		SizeBytes:   a.SizeBytes,
		CreatedAt:   a.CreatedAt.UTC(),
	}
}

// Requests. Fields a client may leave out are pointers (or have a zero value that
// means "not given"), and decodeJSON refuses fields that are not listed here.

type signupRequest struct {
	Email    string `json:"email"`
	Name     string `json:"name"`
	Password string `json:"password"`
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// LogValue is what slog prints for a login request: never the password, even when
// someone logs the whole request while debugging.
func (r loginRequest) LogValue() slog.Value {
	return slog.GroupValue(slog.String("email", r.Email), slog.String("password", "[hidden]"))
}

// LogValue hides the password of a signup request too.
func (r signupRequest) LogValue() slog.Value {
	return slog.GroupValue(slog.String("email", r.Email), slog.String("name", r.Name), slog.String("password", "[hidden]"))
}

type createProjectRequest struct {
	Name        string  `json:"name"`
	Description *string `json:"description"`
	Color       string  `json:"color"`
	Members     []struct {
		UserID int64  `json:"user_id"`
		Role   string `json:"role"`
	} `json:"members"` // this course's extension: members to add at once
}

type addMemberRequest struct {
	UserID int64  `json:"user_id"`
	Role   string `json:"role"`
}

type createTaskRequest struct {
	Title       string  `json:"title"`
	Description *string `json:"description"`
	Priority    *int    `json:"priority"`
	DueOn       *string `json:"due_on"`
	AssigneeID  *int64  `json:"assignee_id"`
}

type transitionRequest struct {
	To string `json:"to"`
}

type createCommentRequest struct {
	Body string `json:"body"`
}

// parseDate reads a YYYY-MM-DD date. A well-formed request with a date that does not
// exist, such as 2026-13-01, breaks a rule, so it is a 422 for field.
func parseDate(field string, s *string) (*time.Time, error) {
	if s == nil {
		return nil, nil
	}
	d, err := time.Parse(time.DateOnly, *s)
	if err != nil {
		return nil, domain.Invalid(field, "must be a real date like 2026-10-12")
	}
	return &d, nil
}

// etag is a task's version as a strong entity tag, "v3". Clients send it back in
// If-Match to say which version their change is based on.
func etag(version int64) string { return `"v` + strconv.FormatInt(version, 10) + `"` }

// EncodeCursor turns where a page of comments ended into the opaque next_cursor:
// base64url of {"t":"<created_at>","id":<id>}. It appends into one buffer instead of
// calling json.Marshal and fmt.Sprintf, which is what makes it cheap
// (BenchmarkEncodeCursor).
func EncodeCursor(c domain.CommentCursor) string {
	buf := make([]byte, 0, 64)
	buf = append(buf, `{"t":"`...)
	buf = c.CreatedAt.UTC().AppendFormat(buf, time.RFC3339Nano)
	buf = append(buf, `","id":`...)
	buf = strconv.AppendInt(buf, c.ID, 10)
	buf = append(buf, '}')
	return base64.RawURLEncoding.EncodeToString(buf)
}

// DecodeCursor reads a cursor EncodeCursor made. Anything else is an error.
func DecodeCursor(s string) (domain.CommentCursor, error) {
	raw, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return domain.CommentCursor{}, err
	}
	var v struct {
		T  time.Time `json:"t"`
		ID int64     `json:"id"`
	}
	if err := json.Unmarshal(raw, &v); err != nil {
		return domain.CommentCursor{}, err
	}
	if v.ID < 1 || v.T.IsZero() {
		return domain.CommentCursor{}, strconv.ErrSyntax
	}
	return domain.CommentCursor{CreatedAt: v.T, ID: v.ID}, nil
}
