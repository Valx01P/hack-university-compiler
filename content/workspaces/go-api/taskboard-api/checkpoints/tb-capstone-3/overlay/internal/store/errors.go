package store

import (
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"example.com/taskboard/internal/domain"
)

// fieldRule is the field a constraint protects and what to tell the client.
type fieldRule struct {
	field   string
	message string
}

// constraints maps the name of each constraint a client can break to its field. The
// names are the ones the migrations give or PostgreSQL derives
// (<table>_<column>_check, <table>_<column>_fkey, <table>_pkey).
var constraints = map[string]fieldRule{
	"users_email_key":              {"email", "is already registered"},
	"users_name_check":             {"name", "must be 1 to 50 characters"},
	"projects_owner_name_key":      {"name", "is already used by another of your projects"},
	"projects_name_check":          {"name", "must be 3 to 100 characters"},
	"projects_description_check":   {"description", "must be at most 500 characters"},
	"projects_color_check":         {"color", "must be a color like #2563eb"},
	"project_members_pkey":         {"user_id", "is already a member of this project"},
	"project_members_user_id_fkey": {"user_id", "is not a user"},
	"project_members_role_check":   {"role", "must be owner or member"},
	"tasks_title_check":            {"title", "must be 1 to 120 characters"},
	"tasks_description_check":      {"description", "must be at most 2000 characters"},
	"tasks_status_check":           {"status", "must be todo, doing, or done"},
	"tasks_priority_check":         {"priority", "must be 1, 2, or 3"},
	"tasks_assignee_id_fkey":       {"assignee_id", "is not a member of this project"},
	"comments_body_check":          {"body", "must be 1 to 2000 characters"},
	"labels_project_name_key":      {"name", "is already used by another label of this project"},
	"labels_name_check":            {"name", "must be 1 to 30 characters"},
	"labels_color_check":           {"color", "must be a color like #f59e0b"},
	"task_watchers_user_id_fkey":   {"user_id", "is not a user"},
}

// mapError translates what pgx and PostgreSQL report into the domain's errors, so no
// layer above the store ever sees a pgx type:
//
//   - pgx.ErrNoRows becomes domain.ErrNotFound, as "task 999 not found";
//   - a unique violation (23505) becomes a *domain.ConflictError for its field;
//   - a foreign key (23503) or check (23514) violation becomes a
//     *domain.ValidationError for its field.
//
// Anything else is wrapped and stays a 500: an error nobody planned for should be
// seen in the logs and fixed, not dressed up as the client's fault.
func mapError(err error, entity string, id int64) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, pgx.ErrNoRows) {
		if id == 0 {
			return fmt.Errorf("%s %w", entity, domain.ErrNotFound)
		}
		return fmt.Errorf("%s %d %w", entity, id, domain.ErrNotFound)
	}
	if pgErr, ok := errors.AsType[*pgconn.PgError](err); ok {
		rule, known := constraints[pgErr.ConstraintName]
		switch {
		case known && pgErr.Code == "23505":
			return domain.Conflict(rule.field, rule.message)
		case known && (pgErr.Code == "23503" || pgErr.Code == "23514"):
			return domain.Invalid(rule.field, rule.message)
		}
	}
	return fmt.Errorf("%s: %w", entity, err)
}
