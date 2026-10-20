package api

import (
	"testing"
	"time"

	"example.com/taskboard/internal/domain"
)

func TestCursorRoundTrip(t *testing.T) {
	tests := []domain.CommentCursor{
		{CreatedAt: time.Date(2026, 9, 15, 13, 30, 0, 0, time.UTC), ID: 10},
		{CreatedAt: time.Date(2026, 10, 1, 9, 0, 0, 123456000, time.UTC), ID: 150000},
	}
	for _, c := range tests {
		got, err := DecodeCursor(EncodeCursor(c))
		if err != nil || !got.CreatedAt.Equal(c.CreatedAt) || got.ID != c.ID {
			t.Errorf("round trip of %+v = %+v, %v", c, got, err)
		}
	}
	if got := EncodeCursor(tests[0]); got != "eyJ0IjoiMjAyNi0wOS0xNVQxMzozMDowMFoiLCJpZCI6MTB9" {
		t.Errorf("EncodeCursor = %s: clients may hold old cursors, so the format must not change", got)
	}
}

func TestDecodeCursorRejects(t *testing.T) {
	for _, s := range []string{"", "not-a-cursor", "e30", "eyJpZCI6MH0"} {
		if _, err := DecodeCursor(s); err == nil {
			t.Errorf("DecodeCursor(%q) succeeded", s)
		}
	}
}

func BenchmarkEncodeCursor(b *testing.B) {
	c := domain.CommentCursor{CreatedAt: time.Date(2026, 9, 15, 13, 30, 0, 0, time.UTC), ID: 10}
	b.ReportAllocs()
	for b.Loop() {
		EncodeCursor(c)
	}
}
