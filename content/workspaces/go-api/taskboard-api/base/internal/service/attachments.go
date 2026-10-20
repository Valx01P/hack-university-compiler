package service

import (
	"context"
	"io"
	"log/slog"
	"path/filepath"
	"strings"

	"example.com/taskboard/internal/clock"
	"example.com/taskboard/internal/domain"
)

// UploadTypes are the file types tasks accept, by the type http.DetectContentType
// sniffs from the file's first bytes, with the extension the stored file gets.
var UploadTypes = map[string]string{
	"image/png":       ".png",
	"image/jpeg":      ".jpg",
	"application/pdf": ".pdf",
}

// AttachmentService stores files on tasks. Members may upload, and whoever may see a
// task may download its files.
type AttachmentService struct {
	st    Stores
	clock clock.Clock
	log   *slog.Logger
}

// NewAttachmentService returns an AttachmentService over st.
func NewAttachmentService(st Stores, clk clock.Clock, log *slog.Logger) *AttachmentService {
	return &AttachmentService{st: st, clock: clk, log: log}
}

// Upload saves body as a new attachment of a task. contentType must be a key of
// UploadTypes. The file is written first and removed again if its row cannot be
// stored, so no file is left that nothing points to.
func (s *AttachmentService) Upload(ctx context.Context, actor domain.User, taskID int64, name, contentType string, body io.Reader) (domain.Attachment, error) {
	t, err := s.st.Tasks.Get(ctx, taskID)
	if err != nil {
		return domain.Attachment{}, err
	}
	a, err := accessTo(ctx, s.st.Projects, actor, t.ProjectID)
	if err != nil {
		return domain.Attachment{}, err
	}
	switch {
	case !canView(a):
		return domain.Attachment{}, notFound("task", taskID)
	case !canEdit(a):
		return domain.Attachment{}, forbidden("only members of the project can upload files")
	}
	ext, ok := UploadTypes[contentType]
	if !ok {
		return domain.Attachment{}, domain.Invalid("file", "must be a PNG, JPEG, or PDF file")
	}

	stored, size, err := s.st.Files.Save(body, ext)
	if err != nil {
		return domain.Attachment{}, err
	}
	created, err := s.st.Attachments.Create(ctx, domain.Attachment{
		TaskID:       taskID,
		ProjectID:    t.ProjectID,
		StoredName:   stored,
		OriginalName: cleanName(name),
		ContentType:  contentType,
		SizeBytes:    size,
		CreatedAt:    s.clock.Now(),
	})
	if err != nil {
		if rmErr := s.st.Files.Remove(stored); rmErr != nil {
			s.log.WarnContext(ctx, "remove orphaned upload", "file", stored, "err", rmErr)
		}
		return domain.Attachment{}, err
	}
	return created, nil
}

// Open returns an attachment the actor may see, with its file to read. The caller
// closes the file.
func (s *AttachmentService) Open(ctx context.Context, actor domain.User, id int64) (domain.Attachment, io.ReadSeekCloser, error) {
	att, err := s.st.Attachments.Get(ctx, id)
	if err != nil {
		return domain.Attachment{}, nil, err
	}
	a, err := accessTo(ctx, s.st.Projects, actor, att.ProjectID)
	if err != nil {
		return domain.Attachment{}, nil, err
	}
	if !canView(a) {
		return domain.Attachment{}, nil, notFound("attachment", id)
	}
	f, err := s.st.Files.Open(att.StoredName)
	if err != nil {
		return domain.Attachment{}, nil, err
	}
	return att, f, nil
}

// cleanName keeps only the last element of an uploaded file's name, without control
// characters, since it is shown to people and sent back in Content-Disposition. It is
// never used as a path: files are stored under random names.
func cleanName(name string) string {
	name = filepath.Base(strings.ReplaceAll(name, `\`, "/"))
	name = strings.Map(func(r rune) rune {
		if r < 0x20 || r == 0x7f {
			return -1
		}
		return r
	}, name)
	if name == "" || name == "." || name == "/" {
		return "file"
	}
	return name
}
