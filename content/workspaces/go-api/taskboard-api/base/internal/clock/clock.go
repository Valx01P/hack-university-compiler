// Package clock is where the app asks what time it is. Code that stamps created_at,
// computes an expiry, or decides what is overdue takes a Clock instead of calling
// time.Now, so tests, examples, and checks can stop time.
package clock

import (
	"fmt"
	"time"
)

// Clock tells the time.
type Clock interface {
	Now() time.Time
}

// System is the real clock, in UTC.
type System struct{}

// Now returns the real time, in UTC.
func (System) Now() time.Time { return time.Now().UTC() }

// Fixed is a clock that always says the same instant.
type Fixed time.Time

// Now returns the fixed instant.
func (f Fixed) Now() time.Time { return time.Time(f) }

// FromEnv returns a Fixed clock when HU_FIXED_TIME holds an RFC 3339 time (Hack
// University sets it to 2026-10-01T09:00:00Z), and the System clock otherwise.
func FromEnv(getenv func(string) string) (Clock, error) {
	v := getenv("HU_FIXED_TIME")
	if v == "" {
		return System{}, nil
	}
	t, err := time.Parse(time.RFC3339, v)
	if err != nil {
		return nil, fmt.Errorf("HU_FIXED_TIME must be an RFC 3339 time such as 2026-10-01T09:00:00Z: %w", err)
	}
	return Fixed(t.UTC()), nil
}
