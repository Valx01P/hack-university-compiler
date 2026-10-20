package background

import (
	"errors"
	"io"
	"log/slog"
	"slices"
	"sync"
	"testing"
)

func TestPoolRefusesWhenFullAndDrainsOnClose(t *testing.T) {
	p := NewPool(1, 2, slog.New(slog.NewTextHandler(io.Discard, nil)))
	gate := make(chan struct{})
	started := make(chan struct{})
	var mu sync.Mutex
	var done []int
	record := func(id int) func() {
		return func() {
			mu.Lock()
			done = append(done, id)
			mu.Unlock()
		}
	}
	if err := p.Submit(func() { close(started); <-gate; record(1)() }); err != nil {
		t.Fatal(err)
	}
	<-started // the only worker is busy, so the next jobs wait in the queue
	var refused int
	for id := 2; id <= 6; id++ {
		if err := p.Submit(record(id)); errors.Is(err, ErrQueueFull) {
			refused++
		} else if err != nil {
			t.Fatal(err)
		}
	}
	close(gate)
	if err := p.Close(t.Context()); err != nil {
		t.Fatal(err)
	}
	if refused != 3 || !slices.Equal(done, []int{1, 2, 3}) {
		t.Errorf("refused %d and ran %v, want 3 refused and [1 2 3] run", refused, done)
	}
	if err := p.Submit(record(7)); !errors.Is(err, ErrClosed) {
		t.Errorf("Submit after Close: %v, want ErrClosed", err)
	}
}
