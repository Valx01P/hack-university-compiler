// How rows become JSON. Routes never send a row as stored: these functions pick the fields the
// Taskboard contract defines, so a password or a session token can never leak into a response.
import type { CommentRow, Db, LabelRow, ProjectRole, ProjectRow, Status, TaskRow, UserRow } from "./db.ts";

/** Byte order, like PostgreSQL's C collation, so every backend sorts names the same way. */
export const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export const userView = (u: UserRow) => ({ id: u.id, email: u.email, name: u.name, role: u.role, created_at: u.created_at });

export const userSummary = (u: UserRow) => ({ id: u.id, name: u.name, email: u.email });

/** A user shown inside another resource (a comment's author, a watcher): never an email. */
export const userRef = (u: UserRow) => ({ id: u.id, name: u.name });

export function userById(db: Db, id: number): UserRow | undefined {
  return db.users.find((u) => u.id === id);
}

export function taskCounts(db: Db, projectId: number): Record<Status, number> {
  const counts = { todo: 0, doing: 0, done: 0 };
  for (const task of db.tasks) if (task.project_id === projectId) counts[task.status] += 1;
  return counts;
}

export function membersView(db: Db, projectId: number) {
  return db.project_members
    .filter((m) => m.project_id === projectId)
    .toSorted((a, b) => a.user_id - b.user_id)
    .map((m) => {
      const user = userById(db, m.user_id)!;
      return { user_id: user.id, name: user.name, email: user.email, role: m.role };
    });
}

export function projectView(db: Db, p: ProjectRow) {
  return { id: p.id, name: p.name, description: p.description, color: p.color, owner_id: p.owner_id, created_at: p.created_at, members: membersView(db, p.id) };
}

export function projectListItem(db: Db, p: ProjectRow, role: ProjectRole) {
  return { id: p.id, name: p.name, description: p.description, color: p.color, owner_id: p.owner_id, role, task_counts: taskCounts(db, p.id), created_at: p.created_at };
}

/** A task's labels, sorted by name (the labels tier). */
export function labelsOf(db: Db, taskId: number) {
  return db.task_labels
    .filter((tl) => tl.task_id === taskId)
    .map((tl) => db.labels.find((l) => l.id === tl.label_id))
    .filter((label): label is LabelRow => label !== undefined)
    .toSorted((a, b) => compareText(a.name, b.name) || a.id - b.id)
    .map((l) => ({ id: l.id, name: l.name, color: l.color }));
}

export function taskView(db: Db, t: TaskRow) {
  return {
    id: t.id,
    project_id: t.project_id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    due_on: t.due_on,
    assignee_id: t.assignee_id,
    version: t.version,
    completed_at: t.completed_at,
    created_at: t.created_at,
    updated_at: t.updated_at,
    labels: labelsOf(db, t.id),
  };
}

/** The strong entity tag of a task's version. PATCH must send it back in If-Match. */
export const etag = (t: TaskRow): string => `"v${t.version}"`;

export function commentView(db: Db, c: CommentRow) {
  return { id: c.id, task_id: c.task_id, author: userRef(userById(db, c.author_id)!), body: c.body, created_at: c.created_at };
}

export function labelView(db: Db, l: LabelRow) {
  const taskCount = db.task_labels.filter((tl) => tl.label_id === l.id).length;
  return { id: l.id, project_id: l.project_id, name: l.name, color: l.color, task_count: taskCount };
}
