package store

import (
	"context"
	"fmt"
	"time"

	"example.com/taskboard/internal/domain"
	"example.com/taskboard/internal/store/sqlcdb"
)

// CommentRepo is the PostgreSQL CommentStore.
type CommentRepo struct{ s *Store }

// NewCommentRepo returns the comment repository of s.
func NewCommentRepo(s *Store) *CommentRepo { return &CommentRepo{s: s} }

// List returns up to limit comments of a task after the cursor, oldest first.
func (r *CommentRepo) List(ctx context.Context, taskID int64, after *domain.CommentCursor, limit int) ([]domain.Comment, error) {
	params := sqlcdb.ListCommentsParams{TaskID: taskID, RowLimit: int32(limit)}
	if after != nil {
		params.AfterCreatedAt = tsTo(after.CreatedAt)
		params.AfterID = &after.ID
	}
	rows, err := r.s.queries(ctx).ListComments(ctx, params)
	if err != nil {
		return nil, mapError(err, "comments", 0)
	}
	out := make([]domain.Comment, len(rows))
	for i, row := range rows {
		out[i] = comment(row.ID, row.TaskID, row.AuthorID, row.AuthorName, row.Body, tsFrom(row.CreatedAt))
	}
	return out, nil
}

// Get returns one comment.
func (r *CommentRepo) Get(ctx context.Context, id int64) (domain.Comment, error) {
	row, err := r.s.queries(ctx).GetComment(ctx, id)
	if err != nil {
		return domain.Comment{}, mapError(err, "comment", id)
	}
	return comment(row.ID, row.TaskID, row.AuthorID, row.AuthorName, row.Body, tsFrom(row.CreatedAt)), nil
}

// Create inserts a comment after its BeforeCreate hook, which cleans and checks the
// body.
func (r *CommentRepo) Create(ctx context.Context, c domain.Comment) (domain.Comment, error) {
	if err := beforeCreate(ctx, &c); err != nil {
		return domain.Comment{}, err
	}
	row, err := r.s.queries(ctx).CreateComment(ctx, sqlcdb.CreateCommentParams{
		TaskID:    c.TaskID,
		AuthorID:  c.Author.ID,
		Body:      c.Body,
		CreatedAt: tsTo(c.CreatedAt),
	})
	if err != nil {
		return domain.Comment{}, mapError(err, "comment", 0)
	}
	return comment(row.ID, row.TaskID, row.AuthorID, row.AuthorName, row.Body, tsFrom(row.CreatedAt)), nil
}

// Delete removes a comment.
func (r *CommentRepo) Delete(ctx context.Context, id int64) error {
	n, err := r.s.queries(ctx).DeleteComment(ctx, id)
	if err != nil {
		return mapError(err, "comment", id)
	}
	if n == 0 {
		return fmt.Errorf("comment %d %w", id, domain.ErrNotFound)
	}
	return nil
}

// comment builds a domain.Comment from the columns every comment query returns.
func comment(id, taskID, authorID int64, authorName, body string, createdAt time.Time) domain.Comment {
	return domain.Comment{
		ID:        id,
		TaskID:    taskID,
		Author:    domain.UserRef{ID: authorID, Name: authorName},
		Body:      body,
		CreatedAt: createdAt,
	}
}
