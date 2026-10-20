package domain

import (
	"context"
	"fmt"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

// MaxCommentBody is the longest comment, in characters.
const MaxCommentBody = 2000

// Comment is a message on a task. Comments are listed oldest first by (CreatedAt, ID),
// since two comments can share a timestamp.
type Comment struct {
	ID        int64
	TaskID    int64
	Author    UserRef
	Body      string
	CreatedAt time.Time
}

// BeforeCreate is the model's hook, run by the store before every INSERT: it removes
// control characters other than newlines, trims the body, and refuses it when nothing
// is left or it is too long.
func (c *Comment) BeforeCreate(ctx context.Context) error {
	c.Body = strings.TrimSpace(strings.Map(dropControl, c.Body))
	switch n := utf8.RuneCountInString(c.Body); {
	case n == 0:
		return Invalid("body", "is required")
	case n > MaxCommentBody:
		return Invalid("body", fmt.Sprintf("must be at most %d characters", MaxCommentBody))
	}
	return nil
}

// dropControl is a strings.Map function: returning -1 removes the rune.
func dropControl(r rune) rune {
	if r != '\n' && unicode.IsControl(r) {
		return -1
	}
	return r
}

// CommentCursor marks where a page of comments ended: the last comment's time and id.
// The next page starts after it.
type CommentCursor struct {
	CreatedAt time.Time
	ID        int64
}
