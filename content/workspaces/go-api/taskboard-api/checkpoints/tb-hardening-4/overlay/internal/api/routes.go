package api

import (
	"net/http"
	"strconv"
)

// routes registers every endpoint, in one place, so this file is the map of the API.
// Patterns name the method and the path, and {name} segments are read with
// r.PathValue. Routes under /v1 need a login, except signup and login themselves.
func (s *server) routes(mux *http.ServeMux) {
	public := func(pattern string, h apiFunc) { mux.Handle(pattern, s.handle(h)) }
	private := func(pattern string, h apiFunc) { mux.Handle(pattern, s.requireAuth(s.handle(h))) }

	public("GET /healthz", s.healthz)
	public("GET /readyz", s.readyz)

	public("POST /v1/auth/signup", s.signup)
	public("POST /v1/auth/login", s.login)
	private("POST /v1/auth/logout", s.logout)
	private("GET /v1/me", s.me)
	private("GET /v1/users", s.searchUsers)

	private("GET /v1/projects", s.listProjects)
	private("POST /v1/projects", s.createProject)
	private("GET /v1/projects/{projectID}", s.getProject)
	private("PATCH /v1/projects/{projectID}", s.updateProject)
	private("POST /v1/projects/{projectID}/members", s.addMember)
	private("GET /v1/projects/{projectID}/stats", s.projectStats)

	private("GET /v1/projects/{projectID}/tasks", s.listTasks)
	private("POST /v1/projects/{projectID}/tasks", s.createTask)
	private("GET /v1/tasks/{taskID}", s.getTask)
	private("PATCH /v1/tasks/{taskID}", s.updateTask)
	private("DELETE /v1/tasks/{taskID}", s.deleteTask)
	private("POST /v1/tasks/{taskID}/transition", s.transitionTask)

	private("GET /v1/tasks/{taskID}/comments", s.listComments)
	private("POST /v1/tasks/{taskID}/comments", s.createComment)
	private("DELETE /v1/comments/{commentID}", s.deleteComment)

	private("GET /v1/tasks/{taskID}/watchers", s.listWatchers)
	private("PUT /v1/tasks/{taskID}/watchers/{userID}", s.watch)
	private("DELETE /v1/tasks/{taskID}/watchers/{userID}", s.unwatch)

	private("POST /v1/tasks/{taskID}/attachments", s.uploadAttachment)
	private("GET /v1/attachments/{attachmentID}", s.downloadAttachment)
}

// pathID reads the {name} segment of the matched pattern as a positive id. Anything
// else is a 400 for field, the parameter's name on the wire (such as "project_id").
func pathID(r *http.Request, name, field string) (int64, error) {
	id, err := strconv.ParseInt(r.PathValue(name), 10, 64)
	if err != nil || id < 1 {
		return 0, badRequest(field, "must be a positive whole number")
	}
	return id, nil
}
