package store

import "context"

// beforeCreator and beforeUpdater are the model hooks a domain type can have. The
// repositories call them on every INSERT and UPDATE, so a rule written as a hook (such
// as domain.Task.BeforeCreate) holds for every code path that writes the row.
type beforeCreator interface {
	BeforeCreate(ctx context.Context) error
}

type beforeUpdater interface {
	BeforeUpdate(ctx context.Context) error
}

// beforeCreate runs v's BeforeCreate hook when v has one. v must be a pointer, so the
// hook's changes (a trimmed title, a default priority) reach the INSERT.
func beforeCreate(ctx context.Context, v any) error {
	if h, ok := v.(beforeCreator); ok {
		return h.BeforeCreate(ctx)
	}
	return nil
}

// beforeUpdate runs v's BeforeUpdate hook when v has one.
func beforeUpdate(ctx context.Context, v any) error {
	if h, ok := v.(beforeUpdater); ok {
		return h.BeforeUpdate(ctx)
	}
	return nil
}
