package api

import "net/http"

// listWatchers returns who watches a task, sorted by user id.
func (s *server) listWatchers(w http.ResponseWriter, r *http.Request) error {
	taskID, err := pathID(r, "taskID", "task_id")
	if err != nil {
		return err
	}
	watchers, err := s.Watchers.List(r.Context(), user(r), taskID)
	if err != nil {
		return err
	}
	return writeJSON(w, http.StatusOK, toUserRefs(watchers))
}

// watch makes a member watch a task. PUT, because doing it twice is the same as once.
func (s *server) watch(w http.ResponseWriter, r *http.Request) error {
	taskID, userID, err := watcherPath(r)
	if err != nil {
		return err
	}
	if err := s.Watchers.Watch(r.Context(), user(r), taskID, userID); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// unwatch makes a user stop watching a task.
func (s *server) unwatch(w http.ResponseWriter, r *http.Request) error {
	taskID, userID, err := watcherPath(r)
	if err != nil {
		return err
	}
	if err := s.Watchers.Unwatch(r.Context(), user(r), taskID, userID); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func watcherPath(r *http.Request) (taskID, userID int64, err error) {
	if taskID, err = pathID(r, "taskID", "task_id"); err != nil {
		return 0, 0, err
	}
	if userID, err = pathID(r, "userID", "user_id"); err != nil {
		return 0, 0, err
	}
	return taskID, userID, nil
}
