package api

import (
	"net/http"

	"example.com/taskboard/internal/domain"
)

// listComments returns one page of a task's comments, oldest first:
// GET /v1/tasks/{taskID}/comments?limit=10&cursor=<next_cursor of the previous page>.
func (s *server) listComments(w http.ResponseWriter, r *http.Request) error {
	taskID, err := pathID(r, "taskID", "task_id")
	if err != nil {
		return err
	}
	q := r.URL.Query()
	errs := map[string]string{}
	limit := queryInt(q, "limit", 20, 1, 100, "must be a whole number from 1 to 100", errs)
	var after *domain.CommentCursor
	if q.Has("cursor") {
		c, err := DecodeCursor(q.Get("cursor"))
		if err != nil {
			errs["cursor"] = "is not a cursor this server gave out"
		}
		after = &c
	}
	if len(errs) > 0 {
		return queryError(errs)
	}
	page, err := s.Comments.List(r.Context(), user(r), taskID, after, limit)
	if err != nil {
		return err
	}
	out := commentPage{Items: make([]commentResponse, len(page.Items))}
	for i, c := range page.Items {
		out.Items[i] = toCommentResponse(c)
	}
	if page.Next != nil {
		next := EncodeCursor(*page.Next)
		out.NextCursor = &next
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
