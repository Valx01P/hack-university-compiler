// The mock's storage: one JSON file, api/data/db.json, that every request reads and every change
// writes back. It starts as a copy of api/seed.json, and npm run api:reset, POST /_hu/reset, and
// the IDE's Reset data button copy the seed over it again. Reading the file on each request means
// a reset or a hand edit of db.json shows up at once, without restarting the server.
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const SEED_FILE = join(here, "seed.json");
export const DB_FILE = join(here, "data", "db.json");

export type Status = "todo" | "doing" | "done";
export type ProjectRole = "owner" | "member" | "viewer";

export interface UserRow {
  id: number;
  name: string;
  email: string;
  role: "admin" | "member";
  created_at: string;
  // Plain text, which only a mock may store. A real API keeps a slow hash (bcrypt or Argon2),
  // as the Go, FastAPI, Express, and Spring courses show.
  password: string;
}
export interface ProjectRow {
  id: number;
  name: string;
  description: string | null;
  color: string;
  owner_id: number;
  created_at: string;
}
export interface MemberRow {
  project_id: number;
  user_id: number;
  role: ProjectRole;
}
export interface TaskRow {
  id: number;
  project_id: number;
  title: string;
  description: string | null;
  status: Status;
  priority: number;
  due_on: string | null;
  assignee_id: number | null;
  version: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface CommentRow {
  id: number;
  task_id: number;
  author_id: number;
  body: string;
  created_at: string;
}
export interface WatcherRow {
  task_id: number;
  user_id: number;
}
export interface LabelRow {
  id: number;
  project_id: number;
  name: string;
  color: string;
}
export interface TaskLabelRow {
  task_id: number;
  label_id: number;
}
export interface SessionRow {
  token: string;
  user_id: number;
  expires_at: string;
}

export type IdTable = "users" | "projects" | "tasks" | "comments" | "labels";

export interface Db {
  about?: string;
  users: UserRow[];
  projects: ProjectRow[];
  project_members: MemberRow[];
  tasks: TaskRow[];
  comments: CommentRow[];
  task_watchers: WatcherRow[];
  labels: LabelRow[];
  task_labels: TaskLabelRow[];
  sessions: SessionRow[];
  next_ids: Record<IdTable, number>;
}

export function readDb(): Db {
  if (!existsSync(DB_FILE)) resetDb();
  return JSON.parse(readFileSync(DB_FILE, "utf8")) as Db;
}

/** Writes to a temporary file, then renames it, so a crash never leaves half a file behind. */
export function writeDb(db: Db): void {
  mkdirSync(dirname(DB_FILE), { recursive: true });
  const temp = `${DB_FILE}.${process.pid}.tmp`;
  writeFileSync(temp, formatDb(db));
  renameSync(temp, DB_FILE);
}

/** Copies the seed's bytes, so two resets in a row give byte-identical files. */
export function resetDb(): void {
  mkdirSync(dirname(DB_FILE), { recursive: true });
  const temp = `${DB_FILE}.${process.pid}.tmp`;
  copyFileSync(SEED_FILE, temp);
  renameSync(temp, DB_FILE);
}

export function nextId(db: Db, table: IdTable): number {
  const id = db.next_ids[table];
  db.next_ids[table] = id + 1;
  return id;
}

/** One row per line, so db.json stays easy to read and diff. */
export function formatDb(db: Db): string {
  const members = Object.entries(db).map(([key, value]) => {
    if (!Array.isArray(value) || value.length === 0) return `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`;
    const rows = value.map((row) => `    ${JSON.stringify(row)}`).join(",\n");
    return `  ${JSON.stringify(key)}: [\n${rows}\n  ]`;
  });
  return `{\n${members.join(",\n")}\n}\n`;
}
