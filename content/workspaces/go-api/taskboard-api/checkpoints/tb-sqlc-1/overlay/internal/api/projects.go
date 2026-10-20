package api

import (
	"net/http"
	"strconv"

	"example.com/taskboard/internal/domain"
	"example.com/taskboard/internal/service"
)

// listProjects returns the projects the user is a member of, with task counts.
func (s *server) listProjects(w http.ResponseWriter, r *http.Request) error {
	projects, err := s.Projects.List(r.Context(), user(r))
	if err != nil {
		return err
	}
	out := make([]projectListItem, len(projects))
	for i, p := range projects {
		out[i] = projectListItem{
			ID:          p.ID,
			Name:        p.Name,
			Description: p.Description,
			Color:       p.Color,
			OwnerID:     p.OwnerID,
			Role:        string(p.Role),
			TaskCounts:  toTaskCounts(p.Counts),
			CreatedAt:   p.CreatedAt.UTC(),
		}
	}
	return writeJSON(w, http.StatusOK, out)
}

// createProject makes a project owned by the user.
func (s *server) createProject(w http.ResponseWriter, r *http.Request) error {
	req, err := decodeJSON[createProjectRequest](w, r)
	if err != nil {
		return err
	}
	members := make([]service.NewMember, len(req.Members))
	for i, m := range req.Members {
		members[i] = service.NewMember{UserID: m.UserID, Role: m.Role}
	}
	p := domain.Project{Name: req.Name, Description: req.Description, Color: req.Color}
	created, err := s.Projects.Create(r.Context(), user(r), p, members)
	if err != nil {
		return err
	}
	w.Header().Set("Location", "/v1/projects/"+strconv.FormatInt(created.ID, 10))
	return writeJSON(w, http.StatusCreated, toProjectResponse(created))
}

// getProject returns a project with its members.
func (s *server) getProject(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r, "projectID", "project_id")
	if err != nil {
		return err
	}
	p, err := s.Projects.Get(r.Context(), user(r), id)
	if err != nil {
		return err
	}
	return writeJSON(w, http.StatusOK, toProjectResponse(p))
}

// updateProject renames or restyles a project: send only the fields to change, and
// null to clear the description.
func (s *server) updateProject(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r, "projectID", "project_id")
	if err != nil {
		return err
	}
	body, err := decodePatch(w, r, "name", "description", "color")
	if err != nil {
		return err
	}
	var patch service.ProjectPatch
	if patch.Name.Set, err = patchField(body, "name", &patch.Name.Value); err != nil {
		return err
	}
	if patch.Description.Set, err = patchField(body, "description", &patch.Description.Value); err != nil {
		return err
	}
	if patch.Color.Set, err = patchField(body, "color", &patch.Color.Value); err != nil {
		return err
	}
	p, err := s.Projects.Update(r.Context(), user(r), id, patch)
	if err != nil {
		return err
	}
	return writeJSON(w, http.StatusOK, toProjectResponse(p))
}

// addMember adds a user to a project. The role defaults to member.
func (s *server) addMember(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r, "projectID", "project_id")
	if err != nil {
		return err
	}
	req, err := decodeJSON[addMemberRequest](w, r)
	if err != nil {
		return err
	}
	m, err := s.Projects.AddMember(r.Context(), user(r), id, req.UserID, req.Role)
	if err != nil {
		return err
	}
	return writeJSON(w, http.StatusCreated, toMemberResponse(m))
}
