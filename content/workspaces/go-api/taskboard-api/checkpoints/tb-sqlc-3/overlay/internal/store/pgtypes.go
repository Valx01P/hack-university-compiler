package store

import (
	"time"

	"github.com/jackc/pgx/v5/pgtype"
)

// sqlc.yaml has no type overrides, so the generated code uses pgx's own types for
// times and dates: pgtype.Timestamptz and pgtype.Date, each a value with a Valid flag
// that is false for NULL. These helpers convert them at the edge of the store, so no
// pgtype value reaches the domain.

func tsFrom(t pgtype.Timestamptz) time.Time { return t.Time }

func tsTo(t time.Time) pgtype.Timestamptz { return pgtype.Timestamptz{Time: t, Valid: true} }

func tsPtrFrom(t pgtype.Timestamptz) *time.Time {
	if !t.Valid {
		return nil
	}
	v := t.Time
	return &v
}

func tsPtrTo(t *time.Time) pgtype.Timestamptz {
	if t == nil {
		return pgtype.Timestamptz{}
	}
	return tsTo(*t)
}

func datePtrFrom(d pgtype.Date) *time.Time {
	if !d.Valid {
		return nil
	}
	v := d.Time
	return &v
}

func datePtrTo(t *time.Time) pgtype.Date {
	if t == nil {
		return pgtype.Date{}
	}
	return pgtype.Date{Time: *t, Valid: true}
}
