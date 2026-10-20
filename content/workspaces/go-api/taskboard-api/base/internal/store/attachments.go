package store

import (
	"context"

	"example.com/taskboard/internal/domain"
	"example.com/taskboard/internal/store/sqlcdb"
)

// AttachmentRepo is the PostgreSQL AttachmentStore.
type AttachmentRepo struct{ s *Store }

// NewAttachmentRepo returns the attachment repository of s.
func NewAttachmentRepo(s *Store) *AttachmentRepo { return &AttachmentRepo{s: s} }

// Create stores an attachment's metadata.
func (r *AttachmentRepo) Create(ctx context.Context, a domain.Attachment) (domain.Attachment, error) {
	row, err := r.s.queries(ctx).CreateAttachment(ctx, sqlcdb.CreateAttachmentParams{
		TaskID:       a.TaskID,
		StoredName:   a.StoredName,
		OriginalName: a.OriginalName,
		ContentType:  a.ContentType,
		SizeBytes:    a.SizeBytes,
		CreatedAt:    a.CreatedAt,
	})
	if err != nil {
		return domain.Attachment{}, mapError(err, "attachment", 0)
	}
	return domain.Attachment{
		ID:           row.ID,
		TaskID:       row.TaskID,
		ProjectID:    a.ProjectID,
		StoredName:   row.StoredName,
		OriginalName: row.OriginalName,
		ContentType:  row.ContentType,
		SizeBytes:    row.SizeBytes,
		CreatedAt:    row.CreatedAt,
	}, nil
}

// Get returns an attachment with the project its task belongs to.
func (r *AttachmentRepo) Get(ctx context.Context, id int64) (domain.Attachment, error) {
	row, err := r.s.queries(ctx).GetAttachment(ctx, id)
	if err != nil {
		return domain.Attachment{}, mapError(err, "attachment", id)
	}
	return domain.Attachment{
		ID:           row.ID,
		TaskID:       row.TaskID,
		ProjectID:    row.ProjectID,
		StoredName:   row.StoredName,
		OriginalName: row.OriginalName,
		ContentType:  row.ContentType,
		SizeBytes:    row.SizeBytes,
		CreatedAt:    row.CreatedAt,
	}, nil
}

// ListStoredNames returns the file names of a task's attachments.
func (r *AttachmentRepo) ListStoredNames(ctx context.Context, taskID int64) ([]string, error) {
	names, err := r.s.queries(ctx).ListAttachmentNames(ctx, taskID)
	return names, mapError(err, "attachments", 0)
}
