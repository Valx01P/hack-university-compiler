-- Accounts. Emails reach these queries already normalized (domain.NormalizeEmail).

-- name: CreateUser :one
INSERT INTO users (email, name, password_hash, role, created_at)
VALUES (@email, @name, @password_hash, @role, @created_at)
RETURNING *;

-- name: GetUserByID :one
SELECT * FROM users WHERE id = @id;

-- name: GetUserByEmail :one
SELECT * FROM users WHERE lower(email) = lower(@email);

-- SearchUsers matches a LIKE pattern the store builds from the search text, with %, _,
-- and \ escaped so they match themselves. A NULL pattern matches everyone.
-- name: SearchUsers :many
SELECT * FROM users
WHERE sqlc.narg('pattern')::text IS NULL
   OR name ILIKE sqlc.narg('pattern')
   OR email ILIKE sqlc.narg('pattern')
ORDER BY name, id
LIMIT @max_results;

-- name: ListUsersByIDs :many
SELECT * FROM users WHERE id = ANY(@ids::bigint[]) ORDER BY id;
