package api

import (
	"maps"
	"math"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"unicode/utf8"

	"example.com/taskboard/internal/domain"
	"example.com/taskboard/internal/service"
)

// listTasks returns one page of a project's tasks:
// GET /v1/projects/{projectID}/tasks?status=&assignee_id=&q=&sort=&order=&limit=&offset=&include=
func (s *server) listTasks(w http.ResponseWriter, r *http.Request) error {
	projectID, err := pathID(r, "projectID", "project_id")
	if err != nil {
		return err
	}
	f, inc, err := parseTaskQuery(r.URL.Query(), projectID)
	if err != nil {
		return err
	}
	page, err := s.Tasks.List(r.Context(), user(r), f, inc)
	if err != nil {
		return err
	}
	items := make([]taskResponse, len(page.Items))
	for i, item := range page.Items {
		items[i] = toTaskItem(item, inc)
	}
	return writeJSON(w, http.StatusOK, taskPage{Items: items, Total: page.Total, Limit: f.Limit, Offset: f.Offset})
}

// parseTaskQuery reads the task list's query string. Every bad parameter is reported
// at once, each in errors under its own name, as a 400.
func parseTaskQuery(q url.Values, projectID int64) (domain.TaskFilter, service.Include, error) {
	f := domain.TaskFilter{ProjectID: projectID, Sort: domain.SortCreated, Limit: 20}
	var inc service.Include
	errs := map[string]string{}

	if q.Has("status") {
		st, err := domain.ParseStatus(q.Get("status"))
		if err != nil {
			errs["status"] = "must be todo, doing, or done"
		}
		f.Status = &st
	}
	if q.Has("assignee_id") {
		v := q.Get("assignee_id")
		id, err := strconv.ParseInt(v, 10, 64)
		switch {
		case v == "none":
			f.Unassigned = true
		case err != nil || id < 1:
			errs["assignee_id"] = "must be a user id or none"
		default:
			f.AssigneeID = &id
		}
	}
	if v := q.Get("q"); v != "" {
		if n := utf8.RuneCountInString(v); n < 2 || n > 100 {
			errs["q"] = "must be 2 to 100 characters"
		}
		f.Query = v
	}
	f.Limit = queryInt(q, "limit", 20, 1, 100, "must be a whole number from 1 to 100", errs)
	f.Offset = queryInt(q, "offset", 0, 0, math.MaxInt32, "must be a whole number, 0 or more", errs)
	if q.Has("include") {
		for part := range strings.SplitSeq(q.Get("include"), ",") {
			switch strings.TrimSpace(part) {
			case "assignee":
				inc.Assignee = true
			case "watchers":
				inc.Watchers = true
			default:
				errs["include"] = "must list assignee, watchers, or both"
			}
		}
	}
	if len(errs) > 0 {
		return f, inc, queryError(errs)
	}
	return f, inc, nil
}

// queryInt reads an optional whole-number query parameter from lo to hi. A bad value
// is noted in errs under the parameter's name, with msg.
func queryInt(q url.Values, name string, def, lo, hi int, msg string, errs map[string]string) int {
	if !q.Has(name) {
		return def
	}
	n, err := strconv.Atoi(q.Get(name))
	if err != nil || n < lo || n > hi {
		errs[name] = msg
		return def
	}
	return n
}

// queryError is the 400 for bad query parameters, naming each one.
func queryError(errs map[string]string) error {
	parts := make([]string, 0, len(errs))
	for _, name := range slices.Sorted(maps.Keys(errs)) {
		parts = append(parts, name+" "+errs[name])
	}
	return &requestError{status: http.StatusBadRequest, detail: strings.Join(parts, "; "), fields: errs}
}

// createTask adds a task to a project.
func (s *server) createTask(w http.ResponseWriter, r *http.Request) error {
	projectID, err := pathID(r, "projectID", "project_id")
	if err != nil {
		return err
	}
	req, err := decodeJSON[createTaskRequest](w, r)
	if err != nil {
		return err
	}
	due, err := parseDate("due_on", req.DueOn)
	if err != nil {
		return err
	}
	t := domain.Task{Title: req.Title, Description: req.Description, DueOn: due, AssigneeID: req.AssigneeID}
	if req.Priority != nil {
		t.Priority = domain.Priority(*req.Priority)
	}
	created, err := s.Tasks.Create(r.Context(), user(r), projectID, t)
	if err != nil {
		return err
	}
	w.Header().Set("Location", "/v1/tasks/"+strconv.FormatInt(created.ID, 10))
	w.Header().Set("ETag", etag(created.Version))
	return writeJSON(w, http.StatusCreated, toTaskResponse(created))
}

// getTask returns a task, with its version as the ETag.
func (s *server) getTask(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r, "taskID", "task_id")
	if err != nil {
		return err
	}
	t, err := s.Tasks.Get(r.Context(), user(r), id)
	if err != nil {
		return err
	}
	w.Header().Set("ETag", etag(t.Version))
	return writeJSON(w, http.StatusOK, toTaskResponse(t))
}

// updateTask edits a task: send only the fields to change, null to clear one, and
// If-Match with the ETag you last read.
func (s *server) updateTask(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r, "taskID", "task_id")
	if err != nil {
		return err
	}
	version, err := ifMatch(r)
	if err != nil {
		return err
	}
	body, err := decodePatch(w, r, "title", "description", "priority", "due_on", "assignee_id")
	if err != nil {
		return err
	}
	var patch domain.TaskPatch
	if patch.Title.Set, err = patchField(body, "title", &patch.Title.Value); err != nil {
		return err
	}
	if patch.Description.Set, err = patchField(body, "description", &patch.Description.Value); err != nil {
		return err
	}
	var priority int
	if patch.Priority.Set, err = patchField(body, "priority", &priority); err != nil {
		return err
	}
	patch.Priority.Value = domain.Priority(priority)
	var due *string
	if patch.DueOn.Set, err = patchField(body, "due_on", &due); err != nil {
		return err
	}
	if patch.DueOn.Value, err = parseDate("due_on", due); err != nil {
		return err
	}
	if patch.AssigneeID.Set, err = patchField(body, "assignee_id", &patch.AssigneeID.Value); err != nil {
		return err
	}
	t, err := s.Tasks.Update(r.Context(), user(r), id, version, patch)
	if err != nil {
		return err
	}
	w.Header().Set("ETag", etag(t.Version))
	return writeJSON(w, http.StatusOK, toTaskResponse(t))
}

// ifMatch reads the version a change is based on from If-Match, such as "v3". With no
// If-Match the answer is 428: an edit that does not say which version it saw could
// silently overwrite someone else's. A tag this server never made matches no version,
// which the service answers with 412.
func ifMatch(r *http.Request) (int64, error) {
	h := strings.TrimSpace(r.Header.Get("If-Match"))
	if h == "" {
		return 0, &requestError{status: http.StatusPreconditionRequired, detail: `send If-Match with the task's ETag, such as "v1"`}
	}
	digits, ok := strings.CutPrefix(h, `"v`)
	digits, ok2 := strings.CutSuffix(digits, `"`)
	n, err := strconv.ParseInt(digits, 10, 64)
	if !ok || !ok2 || err != nil || n < 1 {
		return 0, nil
	}
	return n, nil
}

// deleteTask removes a task. Only the project's owners may.
func (s *server) deleteTask(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r, "taskID", "task_id")
	if err != nil {
		return err
	}
	if err := s.Tasks.Delete(r.Context(), user(r), id); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// transitionTask moves a task to another status: {"to": "done"}.
func (s *server) transitionTask(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r, "taskID", "task_id")
	if err != nil {
		return err
	}
	req, err := decodeJSON[transitionRequest](w, r)
	if err != nil {
		return err
	}
	t, err := s.Tasks.Transition(r.Context(), user(r), id, req.To)
	if err != nil {
		return err
	}
	w.Header().Set("ETag", etag(t.Version))
	return writeJSON(w, http.StatusOK, toTaskResponse(t))
}
