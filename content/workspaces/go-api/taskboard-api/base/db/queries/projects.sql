-- Projects and members.

-- name: CreateProject :one
INSERT INTO projects (owner_id, name, description, color, created_at)
VALUES (@owner_id, @name, @description, @color, @created_at)
RETURNING *;

-- RenameProject saves a project's name, description, and color.
-- name: RenameProject :one
UPDATE projects
SET name = @name, description = @description, color = @color
WHERE id = @id
RETURNING *;

-- name: AddMember :exec
INSERT INTO project_members (project_id, user_id, role, created_at)
VALUES (@project_id, @user_id, @role, @created_at);

-- GetProjectForMember returns a project only to its members, with their role, and to
-- admins (with a NULL role when they are not members). Anyone else gets no row, which
-- the store reports as not found: a guessed id reveals nothing.
-- name: GetProjectForMember :one
SELECT p.*, m.role AS member_role
FROM projects p
LEFT JOIN project_members m ON m.project_id = p.id AND m.user_id = @user_id
WHERE p.id = @project_id
  AND (m.user_id IS NOT NULL OR @is_admin::boolean);

-- ListProjectsForUser counts every project's tasks by status in one grouped query
-- instead of one query per project.
-- name: ListProjectsForUser :many
WITH mine AS (
    SELECT project_id, role FROM project_members WHERE user_id = @user_id
),
counts AS (
    SELECT t.project_id,
           count(*) FILTER (WHERE t.status = 'todo')  AS todo,
           count(*) FILTER (WHERE t.status = 'doing') AS doing,
           count(*) FILTER (WHERE t.status = 'done')  AS done
    FROM tasks t
    JOIN mine USING (project_id)
    GROUP BY t.project_id
)
SELECT p.*,
       mine.role AS member_role,
       coalesce(counts.todo, 0)::bigint  AS todo,
       coalesce(counts.doing, 0)::bigint AS doing,
       coalesce(counts.done, 0)::bigint  AS done
FROM mine
JOIN projects p ON p.id = mine.project_id
LEFT JOIN counts ON counts.project_id = p.id
ORDER BY p.id;

-- name: ListMembers :many
SELECT m.user_id, u.name, u.email, m.role
FROM project_members m
JOIN users u ON u.id = m.user_id
WHERE m.project_id = @project_id
ORDER BY m.user_id;

-- name: MemberRole :one
SELECT role FROM project_members WHERE project_id = @project_id AND user_id = @user_id;
