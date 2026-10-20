package api

import "net/http"

// listComments returns a task's comments, oldest first: GET /v1/tasks/{taskID}/comments.
func (s *server) listComments(w http.ResponseWriter, r *http.Request) error {
	taskID, err := pathID(r, "taskID", "task_id")
	if err != nil {
		return err
	}
	// TODO: page the comments: read limit (1 to 100, 20 by default) and cursor, ask for
	// one comment more than the page holds, and send next_cursor when it came back.
	comments, err := s.Comments.List(r.Context(), user(r), taskID)
	if err != nil {
		return err
	}
	out := commentPage{Items: make([]commentResponse, len(comments))}
	for i, c := range comments {
		out.Items[i] = toCommentResponse(c)
	}
	return writeJSON(w, http.StatusOK, out)
}

// createComment adds the user's comment to a task.
func (s *server) createComment(w http.ResponseWriter, r *http.Request) error {
	taskID, err := pathID(r, "taskID", "task_id")
	if err != nil {
		return err
	}
	req, err := decodeJSON[createCommentRequest](w, r)
	if err != nil {
		return err
	}
	c, err := s.Comments.Create(r.Context(), user(r), taskID, req.Body)
	if err != nil {
		return err
	}
	return writeJSON(w, http.StatusCreated, toCommentResponse(c))
}

// deleteComment removes a comment. Its author or a project owner may.
func (s *server) deleteComment(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r, "commentID", "comment_id")
	if err != nil {
		return err
	}
	if err := s.Comments.Delete(r.Context(), user(r), id); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}
