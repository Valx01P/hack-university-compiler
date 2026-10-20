-- taskapi's database, schema version 2. bin/taskapictl reset rebuilds it:
--   sqlite3 data/shop.db < releases/current/seed.sql
PRAGMA user_version = 2;

BEGIN;

CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
  password_hash TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE tokens (
  token   TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id),
  label   TEXT NOT NULL
);

CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users (id),
  created_at TEXT NOT NULL
);

CREATE TABLE orders (
  id          INTEGER PRIMARY KEY,
  customer    TEXT NOT NULL,
  email       TEXT NOT NULL,
  items       INTEGER NOT NULL CHECK (items > 0),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  status      TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded')),
  created_at  TEXT NOT NULL
);

CREATE TABLE tasks (
  id         INTEGER PRIMARY KEY,
  title      TEXT NOT NULL,
  owner      TEXT NOT NULL REFERENCES users (username),
  done       INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE INDEX orders_status ON orders (status);
CREATE INDEX tasks_owner ON tasks (owner);

INSERT INTO users (id, username, name, email, role, password_hash, created_at) VALUES (1, 'ada', 'Ada Lovelace', 'ada@shopfront.example', 'admin', 'pbkdf2_sha256$60000$f86af087a41ab001$d886a7b55f4cf5f4fac2e998e419d489eabcc799397bdd40f1ee9f91c0404b3d', '2026-01-12T09:00:00Z');
INSERT INTO users (id, username, name, email, role, password_hash, created_at) VALUES (2, 'grace', 'Grace Hopper', 'grace@shopfront.example', 'admin', 'pbkdf2_sha256$60000$8bed5eca07dd43c5$9f6b7dd8210562ce07b54f833930285c27ebd97ad24e539b08efdd460a81cdbb', '2026-01-12T09:05:00Z');
INSERT INTO users (id, username, name, email, role, password_hash, created_at) VALUES (3, 'alan', 'Alan Turing', 'alan@shopfront.example', 'editor', NULL, '2026-02-03T10:20:00Z');
INSERT INTO users (id, username, name, email, role, password_hash, created_at) VALUES (4, 'katherine', 'Katherine Johnson', 'katherine@shopfront.example', 'editor', NULL, '2026-02-17T14:45:00Z');
INSERT INTO users (id, username, name, email, role, password_hash, created_at) VALUES (5, 'daan', 'Daan van der Berg', 'daan@shopfront.example', 'viewer', NULL, '2026-03-02T08:30:00Z');
INSERT INTO users (id, username, name, email, role, password_hash, created_at) VALUES (6, 'mila', 'Mila van der Meer', 'mila@shopfront.example', 'editor', NULL, '2026-03-19T11:10:00Z');
INSERT INTO users (id, username, name, email, role, password_hash, created_at) VALUES (7, 'linus', 'Linus Torvalds', 'linus@shopfront.example', 'viewer', NULL, '2026-04-07T16:00:00Z');
INSERT INTO users (id, username, name, email, role, password_hash, created_at) VALUES (8, 'margaret', 'Margaret Hamilton', 'margaret@shopfront.example', 'editor', NULL, '2026-05-11T09:40:00Z');
INSERT INTO users (id, username, name, email, role, password_hash, created_at) VALUES (9, 'edsger', 'Edsger Dijkstra', 'edsger@shopfront.example', 'viewer', NULL, '2026-06-01T13:15:00Z');
INSERT INTO users (id, username, name, email, role, password_hash, created_at) VALUES (10, 'barbara', 'Barbara Liskov', 'barbara@shopfront.example', 'editor', NULL, '2026-06-22T10:05:00Z');
INSERT INTO users (id, username, name, email, role, password_hash, created_at) VALUES (11, 'sophie', 'Sophie van der Linden', 'sophie@shopfront.example', 'viewer', NULL, '2026-08-04T15:30:00Z');
INSERT INTO users (id, username, name, email, role, password_hash, created_at) VALUES (12, 'ken', 'Ken Thompson', 'ken@shopfront.example', 'viewer', NULL, '2026-09-09T09:00:00Z');
INSERT INTO users (id, username, name, email, role, password_hash, created_at) VALUES (13, 'sloane', 'Sloane Waite', 'sloane@shopfront.example', 'viewer', NULL, '2026-09-30T12:00:00Z');

INSERT INTO tokens (token, user_id, label) VALUES ('dev-token-123', 1, 'local development, admin');
INSERT INTO tokens (token, user_id, label) VALUES ('viewer-token-456', 12, 'read-only dashboard');

INSERT INTO orders (id, customer, email, items, total_cents, status, created_at) VALUES (1, 'Emma Kowalski', 'emma.kowalski@example.com', 4, 7500, 'delivered', '2026-10-01T20:15:00Z');
INSERT INTO orders (id, customer, email, items, total_cents, status, created_at) VALUES (2, 'Aisha Novak', 'aisha.novak@example.com', 3, 4200, 'delivered', '2026-10-02T06:05:00Z');
INSERT INTO orders (id, customer, email, items, total_cents, status, created_at) VALUES (3, 'Julia Ferreira', 'julia.ferreira@example.com', 2, 2750, 'delivered', '2026-10-02T16:51:00Z');
INSERT INTO orders (id, customer, email, items, total_cents, status, created_at) VALUES (4, 'Ines Garcia', 'ines.garcia@example.com', 4, 6200, 'delivered', '2026-10-03T01:46:00Z');
INSERT INTO orders (id, customer, email, items, total_cents, status, created_at) VALUES (5, 'Kofi Rossi', 'kofi.rossi@example.com', 1, 2400, 'cancelled', '2026-10-03T12:33:00Z');
INSERT INTO orders (id, customer, email, items, total_cents, status, created_at) VALUES (6, 'Maya Romano', 'maya.romano@example.com', 5, 13050, 'delivered', '2026-10-03T23:40:00Z');
INSERT INTO orders (id, customer, email, items, total_cents, status, created_at) VALUES (7, 'Amira Dubois', 'amira.dubois@example.com', 1, 240, 'delivered', '2026-10-04T09:56:00Z');
INSERT INTO orders (id, customer, email, items, total_cents, status, created_at) VALUES (8, 'Yusuf Garcia', 'yusuf.garcia@example.com', 2, 2450, 'delivered', '2026-10-04T21:47:00Z');
INSERT INTO orders (id, customer, email, items, total_cents, status, created_at) VALUES (9, 'Rossi, Giulia', 'giulia.rossi@example.com', 1, 800, 'delivered', '2026-10-05T03:55:00Z');
INSERT INTO orders (id, customer, email, items, total_cents, status, created_at) VALUES (10, 'Felix Fischer', 'felix.fischer@example.com', 3, 4250, 'delivered', '2026-10-05T15:36:00Z');
INSERT INTO orders (id, customer, email, items, total_cents, status, created_at) VALUES (11, 'Felix Silva', 'felix.silva@example.com', 2, 3450, 'delivered', '2026-10-06T04:16:00Z');
INSERT INTO orders (id, customer, email, items, total_cents, status, created_at) VALUES (12, 'Kofi Silva', 'kofi.silva@example.com', 3, 12100, 'delivered', '2026-10-06T13:56:00Z');
INSERT INTO orders (id, customer, email, items, total_cents, status, created_at) VALUES (13, 'Emma Schmidt', 'emma.schmidt@example.com', 2, 3750, 'delivered', '2026-10-06T21:57:00Z');
INSERT INTO orders (id, customer, email, items, total_cents, status, created_at) VALUES (14, 'Diego Nguyen', 'diego.nguyen@example.com', 4, 4340, 'delivered', '2026-10-07T11:18:00Z');
INSERT INTO orders (id, customer, email, items, total_cents, status, created_at) VALUES (15, 'Chloe Fischer', 'chloe.fischer@example.com', 2, 2950, 'delivered', '2026-10-07T21:29:00Z');
INSERT INTO orders (id, customer, email, items, total_cents, status, created_at) VALUES (16, 'Leon Dubois', 'leon.dubois@example.com', 1, 990, 'delivered', '2026-10-08T06:39:00Z');
INSERT INTO orders (id, customer, email, items, total_cents, status, created_at) VALUES (17, 'Freya Andersson', 'freya.andersson@example.com', 5, 8350, 'cancelled', '2026-10-08T16:46:00Z');
INSERT INTO orders (id, customer, email, items, total_cents, status, created_at) VALUES (18, 'Robert Hughes, Jr.', 'ines.okafor@example.com', 4, 8600, 'delivered', '2026-10-09T01:49:00Z');
INSERT INTO orders (id, customer, email, items, total_cents, status, created_at) VALUES (19, 'Freya Dubois', 'freya.dubois@example.com', 5, 17350, 'delivered', '2026-10-09T14:03:00Z');
INSERT INTO orders (id, customer, email, items, total_cents, status, created_at) VALUES (20, 'Chloe Kaur', 'chloe.kaur@example.com', 2, 2840, 'delivered', '2026-10-09T20:36:00Z');
INSERT INTO orders (id, customer, email, items, total_cents, status, created_at) VALUES (21, 'Diego Moreau', 'diego.moreau@example.com', 5, 6550, 'delivered', '2026-10-10T06:25:00Z');
INSERT INTO orders (id, customer, email, items, total_cents, status, created_at) VALUES (22, 'Felix Yilmaz', 'felix.yilmaz@example.com', 4, 4100, 'refunded', '2026-10-10T19:45:00Z');
INSERT INTO orders (id, customer, email, items, total_cents, status, created_at) VALUES (23, 'Aisha Haddad', 'aisha.haddad@example.com', 5, 10050, 'delivered', '2026-10-11T03:29:00Z');
INSERT INTO orders (id, customer, email, items, total_cents, status, created_at) VALUES (24, 'Mateo Patel', 'mateo.patel@example.com', 2, 3450, 'delivered', '2026-10-11T14:09:00Z');
INSERT INTO orders (id, customer, email, items, total_cents, status, created_at) VALUES (25, 'Chloe Okafor', 'chloe.okafor@example.com', 1, 650, 'shipped', '2026-10-12T01:02:00Z');
INSERT INTO orders (id, customer, email, items, total_cents, status, created_at) VALUES (26, 'Amira Rossi', 'amira.rossi@example.com', 2, 1650, 'shipped', '2026-10-12T08:49:00Z');
INSERT INTO orders (id, customer, email, items, total_cents, status, created_at) VALUES (27, 'Mei Schmidt', 'mei.schmidt@example.com', 2, 2500, 'shipped', '2026-10-12T22:49:00Z');
INSERT INTO orders (id, customer, email, items, total_cents, status, created_at) VALUES (28, 'Garcia, Lucia', 'nora.kowalski@example.com', 2, 1450, 'shipped', '2026-10-13T08:20:00Z');
INSERT INTO orders (id, customer, email, items, total_cents, status, created_at) VALUES (29, 'Lucas Nguyen', 'lucas.nguyen@example.com', 4, 8600, 'shipped', '2026-10-13T15:06:00Z');
INSERT INTO orders (id, customer, email, items, total_cents, status, created_at) VALUES (30, 'Ivan Jensen', 'ivan.jensen@example.com', 4, 3450, 'shipped', '2026-10-14T02:23:00Z');
INSERT INTO orders (id, customer, email, items, total_cents, status, created_at) VALUES (31, 'Ines Garcia', 'ines.garcia2@example.com', 3, 2500, 'cancelled', '2026-10-14T13:45:00Z');
INSERT INTO orders (id, customer, email, items, total_cents, status, created_at) VALUES (32, 'Mateo Novak', 'mateo.novak@example.com', 3, 6200, 'shipped', '2026-10-15T00:58:00Z');
INSERT INTO orders (id, customer, email, items, total_cents, status, created_at) VALUES (33, 'Aisha Novak', 'aisha.novak2@example.com', 3, 5850, 'shipped', '2026-10-15T12:02:00Z');
INSERT INTO orders (id, customer, email, items, total_cents, status, created_at) VALUES (34, 'Diego Patel', 'diego.patel@example.com', 5, 5130, 'shipped', '2026-10-15T22:16:00Z');
INSERT INTO orders (id, customer, email, items, total_cents, status, created_at) VALUES (35, 'Elena Kaur', 'elena.kaur@example.com', 1, 1900, 'shipped', '2026-10-16T05:39:00Z');
INSERT INTO orders (id, customer, email, items, total_cents, status, created_at) VALUES (36, 'Diego Garcia', 'diego.garcia@example.com', 5, 10200, 'shipped', '2026-10-16T14:57:00Z');
INSERT INTO orders (id, customer, email, items, total_cents, status, created_at) VALUES (37, 'Tomas Romano', 'tomas.romano@example.com', 1, 1250, 'paid', '2026-10-17T04:33:00Z');
INSERT INTO orders (id, customer, email, items, total_cents, status, created_at) VALUES (38, 'Maya Mensah', 'maya.mensah@example.com', 5, 11850, 'paid', '2026-10-17T12:33:00Z');
INSERT INTO orders (id, customer, email, items, total_cents, status, created_at) VALUES (39, 'Freya Kowalski', 'freya.kowalski@example.com', 1, 650, 'pending', '2026-10-17T22:05:00Z');
INSERT INTO orders (id, customer, email, items, total_cents, status, created_at) VALUES (40, 'Kim, Min-jun', 'ivan.patel@example.com', 5, 6550, 'pending', '2026-10-18T09:42:00Z');

INSERT INTO tasks (id, title, owner, done, created_at) VALUES (1, 'Rotate the API logs every night', 'ada', 1, '2026-09-16T07:00:00Z');
INSERT INTO tasks (id, title, owner, done, created_at) VALUES (2, 'Write the on-call runbook', 'grace', 1, '2026-09-17T05:00:00Z');
INSERT INTO tasks (id, title, owner, done, created_at) VALUES (3, 'Add a health check to cron', 'alan', 1, '2026-09-18T00:00:00Z');
INSERT INTO tasks (id, title, owner, done, created_at) VALUES (4, 'Move backups to the new disk', 'katherine', 0, '2026-09-18T19:00:00Z');
INSERT INTO tasks (id, title, owner, done, created_at) VALUES (5, 'Check backups restore cleanly', 'ada', 0, '2026-09-19T08:00:00Z');
INSERT INTO tasks (id, title, owner, done, created_at) VALUES (6, 'Make report-sales.sh take a date range', 'grace', 0, '2026-09-20T04:00:00Z');
INSERT INTO tasks (id, title, owner, done, created_at) VALUES (7, 'Stop putting tokens in URLs', 'alan', 0, '2026-09-21T04:00:00Z');
INSERT INTO tasks (id, title, owner, done, created_at) VALUES (8, 'Alert only when a check changes', 'katherine', 0, '2026-09-21T19:00:00Z');
INSERT INTO tasks (id, title, owner, done, created_at) VALUES (9, 'Import the new users from HR', 'ada', 0, '2026-09-22T17:00:00Z');
INSERT INTO tasks (id, title, owner, done, created_at) VALUES (10, 'Speed up the customer stats report', 'grace', 0, '2026-09-23T10:00:00Z');
INSERT INTO tasks (id, title, owner, done, created_at) VALUES (11, 'Compress old logs in parallel', 'alan', 1, '2026-09-24T02:00:00Z');
INSERT INTO tasks (id, title, owner, done, created_at) VALUES (12, 'Add pre-deploy hooks', 'katherine', 0, '2026-09-25T03:00:00Z');
INSERT INTO tasks (id, title, owner, done, created_at) VALUES (13, 'Snapshot the database before backups', 'ada', 0, '2026-09-25T22:00:00Z');
INSERT INTO tasks (id, title, owner, done, created_at) VALUES (14, 'Write tests for the HTTP helpers', 'grace', 0, '2026-09-26T13:00:00Z');
INSERT INTO tasks (id, title, owner, done, created_at) VALUES (15, 'Restart the worker when it crashes', 'alan', 0, '2026-09-27T06:00:00Z');
INSERT INTO tasks (id, title, owner, done, created_at) VALUES (16, 'Document the deploy steps', 'katherine', 1, '2026-09-28T03:00:00Z');
INSERT INTO tasks (id, title, owner, done, created_at) VALUES (17, 'Clean up old releases', 'ada', 1, '2026-09-29T00:00:00Z');
INSERT INTO tasks (id, title, owner, done, created_at) VALUES (18, 'Shellcheck every script in CI', 'grace', 1, '2026-09-29T18:00:00Z');
INSERT INTO tasks (id, title, owner, done, created_at) VALUES (19, 'Replace the 2016 backup script', 'alan', 1, '2026-09-30T10:00:00Z');
INSERT INTO tasks (id, title, owner, done, created_at) VALUES (20, 'Give Dana access to the shared folder', 'ada', 1, '2026-10-01T09:00:00Z');
INSERT INTO tasks (id, title, owner, done, created_at) VALUES (21, 'Rate limit the import script', 'grace', 0, '2026-10-02T06:00:00Z');
INSERT INTO tasks (id, title, owner, done, created_at) VALUES (22, 'Add the products report to make report', 'alan', 0, '2026-10-02T19:00:00Z');
INSERT INTO tasks (id, title, owner, done, created_at) VALUES (23, 'Check disk usage every 5 minutes', 'katherine', 1, '2026-10-03T18:00:00Z');
INSERT INTO tasks (id, title, owner, done, created_at) VALUES (24, 'Archive September''s exports', 'ada', 0, '2026-10-04T14:00:00Z');
INSERT INTO tasks (id, title, owner, done, created_at) VALUES (25, 'Update the crontab after the move', 'grace', 1, '2026-10-05T09:00:00Z');

COMMIT;
