-- Sessions, found by the SHA-256 of their token.

-- name: CreateSession :exec
INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
VALUES (@token_hash, @user_id, @expires_at, @created_at);

-- GetSessionUser takes the time from the app's clock instead of now(), so expiry
-- follows HU_FIXED_TIME in development and tests.
-- name: GetSessionUser :one
SELECT u.*
FROM sessions s
JOIN users u ON u.id = s.user_id
WHERE s.token_hash = @token_hash AND s.expires_at > @now;

-- name: DeleteSession :exec
DELETE FROM sessions WHERE token_hash = @token_hash;

-- name: DeleteExpiredSessions :execrows
DELETE FROM sessions WHERE expires_at <= @now;
