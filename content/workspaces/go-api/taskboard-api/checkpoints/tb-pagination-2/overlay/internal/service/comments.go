package service

import (
	"context"

	"example.com/taskboard/internal/clock"
	"example.com/taskboard/internal/domain"
)

// CommentService manages comments on tasks. Its rules:
//
//   - Whoever may see a task may read its comments, oldest first.
//   - Members of the task's project may comment. The body is cleaned and checked by
//     domain.Comment.BeforeCreate, and created_at comes from the clock.
//   - A comment's author, or an owner of its project, may delete it. Other members get
//     domain.ErrForbidden, and people who cannot see the task get domain.ErrNotFound.
//   - A task that does not exist, or that the user may not see, is domain.ErrNotFound.
type CommentService struct {
	st    Stores
	clock clock.Clock
}

// NewCommentService returns a CommentService over st.
func NewCommentService(st Stores, clk clock.Clock) *CommentService {
	return &CommentService{st: st, clock: clk}
}

// List returns every comment of a task, oldest first.
func (s *CommentService) List(ctx context.Context, actor domain.User, taskID int64) ([]domain.Comment, error) {
	if _, _, err := s.task(ctx, actor, taskID); err != nil {
		return nil, err
	}
	return s.st.Comments.List(ctx, taskID)
}

// Create adds the actor's comment to a task.
func (s *CommentService) Create(ctx context.Context, actor domain.User, taskID int64, body string) (domain.Comment, error) {
	_, a, err := s.task(ctx, actor, taskID)
	if err != nil {
		return domain.Comment{}, err
	}
	if !canEdit(a) {
		return domain.Comment{}, forbidden("only members of the project can comment")
	}
	return s.st.Comments.Create(ctx, domain.Comment{
		TaskID:    taskID,
		Author:    actor.Ref(),
		Body:      body,
		CreatedAt: s.clock.Now(),
	})
}

// Delete removes a comment, when the actor wrote it or owns its project.
func (s *CommentService) Delete(ctx context.Context, actor domain.User, id int64) error {
	c, err := s.st.Comments.Get(ctx, id)
	if err != nil {
		return err
	}
	_, a, err := s.task(ctx, actor, c.TaskID)
	if err != nil {
		return notFound("comment", id)
	}
	if !canDeleteComment(a, c.Author.ID, actor.ID) {
		return forbidden("only the author or a project owner can delete a comment")
	}
	return s.st.Comments.Delete(ctx, id)
}

// task loads a task the actor may see and what they may do in its project.
func (s *CommentService) task(ctx context.Context, actor domain.User, taskID int64) (domain.Task, access, error) {
	t, err := s.st.Tasks.Get(ctx, taskID)
	if err != nil {
		return domain.Task{}, access{}, err
	}
	a, err := accessTo(ctx, s.st.Projects, actor, t.ProjectID)
	if err != nil {
		return domain.Task{}, access{}, err
	}
	if !canView(a) {
		return domain.Task{}, access{}, notFound("task", taskID)
	}
	return t, a, nil
}
