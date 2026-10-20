package api

import (
	"mime"
	"net/http"
)

// uploadAttachment stores a file on a task: a multipart/form-data body with the file
// in the "file" field, as `curl -F file=@diagram.png` sends it.
func (s *server) uploadAttachment(w http.ResponseWriter, r *http.Request) error {
	// TODO: limit the body with http.MaxBytesReader (2 MB of file plus the form's
	// overhead, 413 past it), parse the form, read the "file" field, sniff its type
	// with http.DetectContentType (PNG, JPEG, or PDF, 415 otherwise), and store it
	// with s.Attachments.Upload. Answer 201 with the attachment and its Location.
	return &requestError{status: http.StatusNotImplemented, detail: "uploading attachments is not written yet"}
}

// downloadAttachment sends a file to whoever may see its task. http.ServeContent
// handles Range requests (206), If-Modified-Since (304), and HEAD, and
// Content-Disposition makes browsers save it under its original name.
func (s *server) downloadAttachment(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r, "attachmentID", "attachment_id")
	if err != nil {
		return err
	}
	a, f, err := s.Attachments.Open(r.Context(), user(r), id)
	if err != nil {
		return err
	}
	defer func() { _ = f.Close() }()
	w.Header().Set("Content-Type", a.ContentType)
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": a.OriginalName}))
	http.ServeContent(w, r, a.OriginalName, a.CreatedAt, f)
	return nil
}
