package api

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"strconv"

	"example.com/taskboard/internal/service"
)

// Upload limits: the file itself, and how much of a multipart form is held in memory
// before the rest spills to a temporary file.
const (
	maxUpload      = 2 << 20
	uploadOverhead = 64 << 10 // the multipart headers and boundaries around the file
	uploadInMemory = 1 << 20
)

// uploadAttachment stores a file on a task: a multipart/form-data body with the file
// in the "file" field, as `curl -F file=@diagram.png` sends it. The type is sniffed
// from the file's first bytes, never trusted from its name or headers.
func (s *server) uploadAttachment(w http.ResponseWriter, r *http.Request) error {
	taskID, err := pathID(r, "taskID", "task_id")
	if err != nil {
		return err
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxUpload+uploadOverhead)
	if err := r.ParseMultipartForm(uploadInMemory); err != nil { //nolint:gosec // MaxBytesReader above bounds the form
		if _, ok := errors.AsType[*http.MaxBytesError](err); ok {
			return tooLarge()
		}
		return &requestError{status: http.StatusBadRequest, detail: "send the file as multipart/form-data in a field named file"}
	}
	defer func() { _ = r.MultipartForm.RemoveAll() }()
	file, header, err := r.FormFile("file")
	if err != nil {
		return badRequest("file", "is required")
	}
	defer func() { _ = file.Close() }()
	if header.Size > maxUpload {
		return tooLarge()
	}

	head := make([]byte, 512)
	n, err := io.ReadFull(file, head)
	if err != nil && !errors.Is(err, io.ErrUnexpectedEOF) && !errors.Is(err, io.EOF) {
		return fmt.Errorf("read upload: %w", err)
	}
	head = head[:n]
	contentType, _, _ := mime.ParseMediaType(http.DetectContentType(head))
	if _, ok := service.UploadTypes[contentType]; !ok {
		return &requestError{
			status: http.StatusUnsupportedMediaType,
			detail: "the file is " + contentType + ", and tasks take PNG, JPEG, or PDF files",
			fields: map[string]string{"file": "must be a PNG, JPEG, or PDF file"},
		}
	}

	body := io.MultiReader(bytes.NewReader(head), file)
	a, err := s.Attachments.Upload(r.Context(), user(r), taskID, header.Filename, contentType, body)
	if err != nil {
		return err
	}
	w.Header().Set("Location", "/v1/attachments/"+strconv.FormatInt(a.ID, 10))
	return writeJSON(w, http.StatusCreated, toAttachmentResponse(a))
}

func tooLarge() error {
	return &requestError{status: http.StatusRequestEntityTooLarge, detail: fmt.Sprintf("files can be at most %d MB", maxUpload>>20)}
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
