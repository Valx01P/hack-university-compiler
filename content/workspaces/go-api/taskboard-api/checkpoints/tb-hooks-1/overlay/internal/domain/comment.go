package domain

import "time"

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

// CommentCursor marks where a page of comments ended: the last comment's time and id.
// The next page starts after it.
type CommentCursor struct {
	CreatedAt time.Time
	ID        int64
}
