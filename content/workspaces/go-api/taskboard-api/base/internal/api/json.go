package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"reflect"
	"slices"
	"strings"
)

// maxBody is the largest JSON request body the API reads.
const maxBody = 1 << 20

// writeJSON writes v as a JSON response. It encodes before writing anything, so a
// value that cannot be encoded still becomes a clean 500 problem. A failed write means
// the client has gone, and there is no one left to tell.
func writeJSON(w http.ResponseWriter, status int, v any) error {
	body, err := json.Marshal(v)
	if err != nil {
		return fmt.Errorf("encode response: %w", err)
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write(append(body, '\n'))
	return nil
}

// decodeJSON reads a request body into a T, strictly: the body must be one JSON
// object of at most 1 MB, sent as application/json, with no field T does not have
// and no field of the wrong type. Every way it can fail is a problem that names the
// field to blame, so a client knows what to fix.
func decodeJSON[T any](w http.ResponseWriter, r *http.Request) (T, error) {
	var v T
	if err := requireJSON(r); err != nil {
		return v, err
	}
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBody))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&v); err != nil {
		return v, decodeError(err)
	}
	if dec.More() {
		return v, &requestError{status: http.StatusBadRequest, detail: "the body must hold exactly one JSON object"}
	}
	return v, nil
}

// requireJSON refuses a body that is not sent as application/json, such as a form.
func requireJSON(r *http.Request) error {
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		return &requestError{status: http.StatusUnsupportedMediaType, detail: "send the body as JSON with Content-Type: application/json"}
	}
	return nil
}

// decodeError turns what encoding/json reports into a problem for the client.
func decodeError(err error) error {
	if maxErr, ok := errors.AsType[*http.MaxBytesError](err); ok {
		return &requestError{status: http.StatusRequestEntityTooLarge, detail: fmt.Sprintf("the body must be at most %d bytes", maxErr.Limit)}
	}
	if typeErr, ok := errors.AsType[*json.UnmarshalTypeError](err); ok {
		if typeErr.Field == "" {
			return &requestError{status: http.StatusBadRequest, detail: "the body must be a JSON object"}
		}
		return badRequest(typeErr.Field, "must be "+jsonType(typeErr.Type))
	}
	if name, ok := strings.CutPrefix(err.Error(), "json: unknown field "); ok {
		return badRequest(strings.Trim(name, `"`), "is not a field of this request")
	}
	switch {
	case errors.Is(err, io.EOF):
		return &requestError{status: http.StatusBadRequest, detail: "the body is empty: send a JSON object"}
	case errors.Is(err, io.ErrUnexpectedEOF):
		return &requestError{status: http.StatusBadRequest, detail: "the body is not complete JSON"}
	}
	if _, ok := errors.AsType[*json.SyntaxError](err); ok {
		return &requestError{status: http.StatusBadRequest, detail: "the body is not valid JSON"}
	}
	return &requestError{status: http.StatusBadRequest, detail: "the body could not be read: " + err.Error()}
}

// jsonType names a Go type the way a JSON client thinks of it.
func jsonType(t reflect.Type) string {
	if t == nil {
		return "of another type"
	}
	for t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	switch t.Kind() {
	case reflect.String:
		return "a string"
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64,
		reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
		return "a whole number"
	case reflect.Float32, reflect.Float64:
		return "a number"
	case reflect.Bool:
		return "true or false"
	case reflect.Slice, reflect.Array:
		return "an array"
	}
	return "an object"
}

// patchBody is a PATCH request: a JSON object holding only the fields to change.
// Reading it as raw members, instead of into a struct, is how a handler tells a field
// that was left out from a field sent as null.
type patchBody map[string]json.RawMessage

// decodePatch reads a PATCH body and refuses members not in allowed.
func decodePatch(w http.ResponseWriter, r *http.Request, allowed ...string) (patchBody, error) {
	body, err := decodeJSON[patchBody](w, r)
	if err != nil {
		return nil, err
	}
	if body == nil {
		return nil, &requestError{status: http.StatusBadRequest, detail: "the body must be a JSON object"}
	}
	for name := range body {
		if !slices.Contains(allowed, name) {
			return nil, badRequest(name, "is not a field of this request")
		}
	}
	if len(body) == 0 {
		return nil, &requestError{status: http.StatusUnprocessableEntity, detail: "send at least one field to change"}
	}
	return body, nil
}

// patchField decodes one member of a PATCH body into v, and reports whether it was
// there. A pointer v accepts null, which clears the field.
func patchField[T any](body patchBody, name string, v *T) (bool, error) {
	raw, ok := body[name]
	if !ok {
		return false, nil
	}
	if err := json.Unmarshal(raw, v); err != nil {
		return false, badRequest(name, "must be "+jsonType(reflect.TypeFor[T]()))
	}
	return true, nil
}
