package jobs

import (
	"testing"
	"time"
)

func TestBackoff(t *testing.T) {
	for attempt, want := range map[int]time.Duration{1: 2 * time.Second, 4: 16 * time.Second, 12: time.Hour, 40: time.Hour} {
		if got := Backoff(attempt); got != want {
			t.Errorf("Backoff(%d) = %v, want %v", attempt, got, want)
		}
	}
}
