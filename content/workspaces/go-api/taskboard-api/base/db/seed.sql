-- The Taskboard contract's seed (contracts/taskboard/seed.json, version 1.0.0): the rows
-- every Taskboard backend starts with, with the same ids, so the acceptance requests and
-- the React course's client find the same data on any of them.
--
-- Every password is "correct horse battery staple", stored as a bcrypt hash at cost 10.
-- Times are fixed and UTC: with HU_FIXED_TIME=2026-10-01T09:00:00Z, tasks 2, 5, and 11
-- are overdue, task 3 is due today, and tasks 7, 9, 12, and 16 are due within a week.
--
-- Ids are given explicitly (OVERRIDING SYSTEM VALUE, since the id columns are GENERATED
-- ALWAYS), ON CONFLICT DO NOTHING makes a second run change nothing, and each sequence
-- is moved past the highest id at the end, so the next task created is 19.
--
-- Load it with `psql "$DATABASE_URL" -f db/seed.sql` or `go run ./cmd/seed`.

BEGIN;

INSERT INTO users (id, email, name, password_hash, role, created_at) OVERRIDING SYSTEM VALUE VALUES
    (1, 'ada@example.com', 'Ada Lovelace', '$2a$10$dX/krGqw6JMYagC1qHHrLOselCz4QFm6PJU3QcnoSERMjLlmH0twi', 'admin', '2026-08-01T09:00:00Z'),
    (2, 'grace@example.com', 'Grace Hopper', '$2a$10$bVX1gpsfcyNUxkkD5xpYAuQnJsz30wf8CLeVglWboLgRo3n0CC53q', 'member', '2026-08-01T09:05:00Z'),
    (3, 'linus@example.com', 'Linus Torvalds', '$2a$10$zIBPBB9ZQOKCnvfuUzNuIOImqUPL7uouBAp66a.FsFmu13OsKJVSy', 'member', '2026-08-01T09:10:00Z'),
    (4, 'margaret@example.com', 'Margaret Hamilton', '$2a$10$Qmp2p8y3expZSWIhV3mJXu0tVbZ16zHXihmAaqzgu0DjnHZwbdGKS', 'member', '2026-08-01T09:15:00Z')
ON CONFLICT DO NOTHING;

INSERT INTO projects (id, owner_id, name, description, color, created_at) OVERRIDING SYSTEM VALUE VALUES
    (1, 1, 'Website Relaunch', 'Redesign and relaunch the marketing site before the November campaign.', '#2563eb', '2026-09-01T09:00:00Z'),
    (2, 2, 'Mobile App', 'Ship version 2 of the iOS and Android app.', '#16a34a', '2026-09-02T09:00:00Z'),
    (3, 3, 'Data Pipeline', 'Nightly exports from the events store to the warehouse.', '#9333ea', '2026-09-03T09:00:00Z')
ON CONFLICT DO NOTHING;

INSERT INTO project_members (project_id, user_id, role, created_at) VALUES
    (1, 1, 'owner', '2026-09-01T09:00:00Z'),
    (1, 2, 'member', '2026-09-01T09:00:00Z'),
    (2, 1, 'member', '2026-09-02T09:00:00Z'),
    (2, 2, 'owner', '2026-09-02T09:00:00Z'),
    (2, 3, 'member', '2026-09-02T09:00:00Z'),
    (3, 3, 'owner', '2026-09-03T09:00:00Z')
ON CONFLICT DO NOTHING;

INSERT INTO tasks (id, project_id, title, description, status, priority, due_on, assignee_id, version, completed_at, created_at, updated_at) OVERRIDING SYSTEM VALUE VALUES
    (1, 1, 'Fix login redirect', 'After signing in, people land on the home page instead of the page they asked for.', 'doing', 3, '2026-10-14', 2, 1, NULL, '2026-09-10T09:00:00Z', '2026-09-10T09:00:00Z'),
    (2, 1, 'Write release notes', 'Summarize every change since the last release for the blog.', 'todo', 2, '2026-09-29', 1, 1, NULL, '2026-09-10T10:00:00Z', '2026-09-10T10:00:00Z'),
    (3, 1, 'Design the pricing page', 'Three plans, a comparison table, and the FAQ.', 'doing', 3, '2026-10-01', 2, 1, NULL, '2026-09-10T11:00:00Z', '2026-09-10T11:00:00Z'),
    (4, 1, 'Migrate images to WebP', 'Convert the hero and product images and keep the originals.', 'doing', 1, '2026-10-20', NULL, 1, NULL, '2026-09-10T12:00:00Z', '2026-09-10T12:00:00Z'),
    (5, 1, 'Audit color contrast', 'Check every text color against WCAG AA.', 'todo', 2, '2026-09-30', 2, 1, NULL, '2026-09-10T13:00:00Z', '2026-09-10T13:00:00Z'),
    (6, 1, 'Set up analytics', 'Privacy-friendly page views without cookies.', 'done', 1, '2026-09-26', 1, 1, '2026-09-24T16:00:00Z', '2026-09-10T14:00:00Z', '2026-09-24T16:00:00Z'),
    (7, 1, 'Update the privacy policy', 'Legal sent the new wording.', 'todo', 2, '2026-10-03', 1, 1, NULL, '2026-09-10T15:00:00Z', '2026-09-10T15:00:00Z'),
    (8, 1, 'Add a sitemap', 'Generate sitemap.xml at build time.', 'done', 1, '2026-10-10', 2, 1, '2026-09-29T15:30:00Z', '2026-09-10T16:00:00Z', '2026-09-29T15:30:00Z'),
    (9, 2, 'Push notification settings', 'Let people choose which notifications they get.', 'doing', 2, '2026-10-06', 3, 1, NULL, '2026-09-12T09:00:00Z', '2026-09-12T09:00:00Z'),
    (10, 2, 'Add social login', 'Sign in with an Apple or Google account.', 'todo', 2, '2026-11-02', NULL, 1, NULL, '2026-09-12T10:00:00Z', '2026-09-12T10:00:00Z'),
    (11, 2, 'Offline mode', 'Cache the last opened board for use without a network.', 'doing', 3, '2026-09-25', 3, 1, NULL, '2026-09-12T11:00:00Z', '2026-09-12T11:00:00Z'),
    (12, 2, 'Fix crash on rotate', 'The board crashes when the phone turns sideways during a drag.', 'doing', 3, '2026-10-08', 2, 1, NULL, '2026-09-12T12:00:00Z', '2026-09-12T12:00:00Z'),
    (13, 2, 'App store screenshots', 'Six screenshots per platform, light and dark.', 'done', 1, '2026-10-15', 1, 1, '2026-09-30T11:00:00Z', '2026-09-12T13:00:00Z', '2026-09-30T11:00:00Z'),
    (14, 2, 'Dark mode', 'Follow the system setting, with a manual switch.', 'done', 2, '2026-10-20', 2, 1, '2026-09-28T17:00:00Z', '2026-09-12T14:00:00Z', '2026-09-28T17:00:00Z'),
    (15, 2, 'Accessibility labels', 'Every button gets a label for screen readers.', 'todo', 2, '2026-11-30', NULL, 1, NULL, '2026-09-12T15:00:00Z', '2026-09-12T15:00:00Z'),
    (16, 3, 'Nightly export job', 'Export yesterday''s events at 02:00 UTC.', 'doing', 3, '2026-10-05', 3, 1, NULL, '2026-09-14T09:00:00Z', '2026-09-14T09:00:00Z'),
    (17, 3, 'Raise test coverage to 80%', 'Start with the parsers and the scheduler.', 'todo', 1, '2026-11-15', NULL, 1, NULL, '2026-09-14T10:00:00Z', '2026-09-14T10:00:00Z'),
    (18, 3, 'Backfill 2025 events', 'Load last year''s events into the warehouse.', 'done', 2, '2026-10-09', 3, 1, '2026-09-30T18:00:00Z', '2026-09-14T11:00:00Z', '2026-09-30T18:00:00Z')
ON CONFLICT DO NOTHING;

INSERT INTO comments (id, task_id, author_id, body, created_at) OVERRIDING SYSTEM VALUE VALUES
    (1, 1, 1, 'I can reproduce it: open /projects/2 signed out, sign in, and you land on /.', '2026-09-15T09:00:00Z'),
    (2, 1, 2, 'The next parameter is dropped when the form posts.', '2026-09-15T09:30:00Z'),
    (3, 1, 1, 'Is it the same on mobile?', '2026-09-15T10:00:00Z'),
    (4, 1, 2, 'Yes, same on Safari for iOS.', '2026-09-15T10:30:00Z'),
    (5, 1, 1, 'Found it: the redirect ignores next when it has a query string.', '2026-09-15T11:00:00Z'),
    (6, 1, 2, 'Should next accept absolute URLs?', '2026-09-15T11:30:00Z'),
    (7, 1, 1, 'No. Same-site relative paths only, or it becomes an open redirect.', '2026-09-15T12:00:00Z'),
    (8, 1, 2, 'Agreed. I''ll add a test for //evil.example too.', '2026-09-15T12:30:00Z'),
    (9, 1, 1, 'Draft fix is on a branch.', '2026-09-15T13:00:00Z'),
    (10, 1, 2, 'Review requested.', '2026-09-15T13:30:00Z'),
    (11, 1, 1, 'Left two comments on the branch.', '2026-09-15T13:30:00Z'),
    (12, 1, 2, 'Addressed both.', '2026-09-15T14:00:00Z'),
    (13, 1, 1, 'The redirect test is flaky on CI.', '2026-09-15T14:30:00Z'),
    (14, 1, 2, 'It waited on a fixed sleep. Switched to waiting for the URL.', '2026-09-15T15:00:00Z'),
    (15, 1, 1, 'Green twice in a row now.', '2026-09-15T15:30:00Z'),
    (16, 1, 2, 'Can we ship it with the pricing page?', '2026-09-15T16:00:00Z'),
    (17, 1, 1, 'Fine by me if QA signs off.', '2026-09-15T16:30:00Z'),
    (18, 1, 2, 'QA found one case: next=/projects/2?tab=list loses the tab.', '2026-09-15T17:00:00Z'),
    (19, 1, 1, 'Encoding issue. Fixed.', '2026-09-15T17:30:00Z'),
    (20, 1, 2, 'QA passed.', '2026-09-15T18:00:00Z'),
    (21, 1, 1, 'Merging after the release notes are in.', '2026-09-15T18:30:00Z'),
    (22, 1, 2, 'Release notes mention it.', '2026-09-15T19:00:00Z'),
    (23, 1, 1, 'Merged.', '2026-09-15T19:30:00Z'),
    (24, 3, 2, 'First draft of the three plans is in Figma.', '2026-09-20T10:00:00Z'),
    (25, 3, 1, 'Can we add a yearly toggle?', '2026-09-20T11:30:00Z'),
    (26, 9, 3, 'The settings screen is wired to the API.', '2026-09-21T09:15:00Z'),
    (27, 9, 2, 'Copy review next.', '2026-09-21T14:00:00Z'),
    (28, 12, 1, 'Only on Android 15 so far.', '2026-09-22T08:45:00Z'),
    (29, 16, 3, 'Runs in 14 minutes on staging.', '2026-09-23T07:30:00Z'),
    (30, 16, 3, 'Added a retry for the upload step.', '2026-09-24T07:30:00Z'),
    (31, 18, 3, 'Backfill finished, row counts match.', '2026-09-30T18:05:00Z')
ON CONFLICT DO NOTHING;

INSERT INTO task_watchers (task_id, user_id, created_at) VALUES
    (1, 1, '2026-09-20T09:00:00Z'),
    (1, 2, '2026-09-20T09:00:00Z'),
    (3, 1, '2026-09-20T09:00:00Z'),
    (9, 1, '2026-09-20T09:00:00Z'),
    (9, 2, '2026-09-20T09:00:00Z'),
    (16, 3, '2026-09-20T09:00:00Z')
ON CONFLICT DO NOTHING;

-- Move each id sequence past the highest id, so new rows continue from there.
SELECT setval(pg_get_serial_sequence('users', 'id'), (SELECT max(id) FROM users));
SELECT setval(pg_get_serial_sequence('projects', 'id'), (SELECT max(id) FROM projects));
SELECT setval(pg_get_serial_sequence('tasks', 'id'), (SELECT max(id) FROM tasks));
SELECT setval(pg_get_serial_sequence('comments', 'id'), (SELECT max(id) FROM comments));

COMMIT;
