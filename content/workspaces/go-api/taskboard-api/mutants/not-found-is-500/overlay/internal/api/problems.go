package api

import (
	"encoding/json"
	"errors"
	"maps"
	"net/http"
	"strconv"

	"example.com/taskboard/internal/domain"
)

// problem is an RFC 9457 problem details body, the shape of every error this API
// sends, as application/problem+json. Errors names each field or parameter to blame,
// and Current holds the task as it is now in a 412.
type problem struct {
	Type      string            `json:"type"`
	Title     string            `json:"title"`
	Status    int               `json:"status"`
	Detail    string            `json:"detail"`
	Instance  string            `json:"instance,omitempty"`
	Errors    map[string]string `json:"errors,omitempty"`
	Current   *taskResponse     `json:"current,omitempty"`
	RequestID string            `json:"request_id,omitempty"`
}

// requestError is a problem a handler found in the request itself, before any rule
// ran: a bad path id, query parameter, header, or body. It carries its own status.
type requestError struct {
	status     int
	detail     string
	fields     map[string]string
	retryAfter int // seconds, for a 429
}

func (e *requestError) Error() string { return e.detail }

// badRequest is a 400 for one field or parameter.
func badRequest(field, message string) error {
	return &requestError{
		status: http.StatusBadRequest,
		detail: field + " " + message,
		fields: map[string]string{field: message},
	}
}

// statusFor maps an error from any layer to its HTTP status. errors.Is and
// errors.AsType look through every %w, so the store's "task 999 not found" is still a
// 404 however many layers wrapped it. Anything not listed is a 500.
func statusFor(err error) int {
	if re, ok := errors.AsType[*requestError](err); ok {
		return re.status
	}
	switch {
	case err == domain.ErrNotFound:
		return http.StatusNotFound
	case errors.Is(err, domain.ErrConflict):
		return http.StatusConflict
	case errors.Is(err, domain.ErrForbidden):
		return http.StatusForbidden
	case errors.Is(err, domain.ErrUnauthenticated):
		return http.StatusUnauthorized
	case errors.Is(err, domain.ErrPrecondition):
		return http.StatusPreconditionFailed
	}
	if _, ok := errors.AsType[*domain.ValidationError](err); ok {
		return http.StatusUnprocessableEntity
	}
	return http.StatusInternalServerError
}

// fieldsOf returns the field messages an error carries, if any.
func fieldsOf(err error) map[string]string {
	if re, ok := errors.AsType[*requestError](err); ok {
		return re.fields
	}
	if v, ok := errors.AsType[*domain.ValidationError](err); ok {
		return v.Fields
	}
	if c, ok := errors.AsType[*domain.ConflictError](err); ok {
		return c.Fields
	}
	return nil
}

// writeProblem answers a request with the problem for err. A 500's detail says
// nothing about the cause, which goes to the log with the request id instead.
func (s *server) writeProblem(w http.ResponseWriter, r *http.Request, err error) {
	status := statusFor(err)
	p := problem{
		Type:      "about:blank",
		Title:     http.StatusText(status),
		Status:    status,
		Detail:    err.Error(),
		Instance:  r.URL.Path,
		Errors:    maps.Clone(fieldsOf(err)),
		RequestID: requestIDFrom(r.Context()),
	}
	if status >= http.StatusInternalServerError {
		s.Log.ErrorContext(r.Context(), "request failed", "request_id", p.RequestID, "err", err)
		p.Detail = "something went wrong on our side; the logs have the details under request_id"
	}
	if stale, ok := errors.AsType[*domain.StaleTaskError](err); ok {
		current := toTaskResponse(stale.Current)
		p.Current = &current
		w.Header().Set("ETag", etag(stale.Current.Version))
	}
	switch status {
	case http.StatusUnauthorized:
		w.Header().Set("WWW-Authenticate", `Bearer realm="taskboard"`)
	case http.StatusTooManyRequests:
		if re, ok := errors.AsType[*requestError](err); ok && re.retryAfter > 0 {
			w.Header().Set("Retry-After", strconv.Itoa(re.retryAfter))
		}
	}
	body, _ := json.Marshal(p)
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(status)
	_, _ = w.Write(append(body, '\n'))
}
