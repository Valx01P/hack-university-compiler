// Package background runs small jobs on a fixed number of goroutines, with a queue of
// bounded size: when the queue is full, Submit says so at once instead of piling up
// goroutines, and Close waits for what was accepted before the program exits.
package background

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"
)

// The errors Submit returns.
var (
	ErrQueueFull = errors.New("background: the queue is full")
	ErrClosed    = errors.New("background: the pool is closed")
)

// Pool runs jobs on its workers.
type Pool struct {
	jobs chan func()
	wg   sync.WaitGroup
	log  *slog.Logger

	mu     sync.RWMutex
	closed bool
}

// NewPool starts workers goroutines that take jobs from a queue of queue slots.
func NewPool(workers, queue int, log *slog.Logger) *Pool {
	p := &Pool{jobs: make(chan func(), queue), log: log}
	for range workers {
		p.wg.Go(p.work)
	}
	return p
}

// work runs jobs until the queue is closed and empty. A job that panics is logged
// and the worker carries on, since one bad job must not stop the others.
func (p *Pool) work() {
	for job := range p.jobs {
		func() {
			defer func() {
				if r := recover(); r != nil {
					p.log.Error("background job panicked", "panic", fmt.Sprint(r))
				}
			}()
			job()
		}()
	}
}

// Submit queues job, or returns ErrQueueFull when every slot is taken (backpressure)
// and ErrClosed after Close.
func (p *Pool) Submit(job func()) error {
	p.mu.RLock()
	defer p.mu.RUnlock()
	if p.closed {
		return ErrClosed
	}
	select {
	case p.jobs <- job:
		return nil
	default:
		return ErrQueueFull
	}
}

// Close stops taking jobs and waits until the queued ones have run, or ctx ends.
func (p *Pool) Close(ctx context.Context) error {
	p.mu.Lock()
	if !p.closed {
		p.closed = true
		close(p.jobs)
	}
	p.mu.Unlock()
	done := make(chan struct{})
	go func() {
		p.wg.Wait()
		close(done)
	}()
	select {
	case <-done:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}
