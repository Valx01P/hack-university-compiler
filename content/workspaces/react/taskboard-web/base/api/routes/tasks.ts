// Tasks: the filtered, sorted, paged list of a project's tasks, create, read, edit, delete, status
// transitions, watchers, and labels on a task. Status changes only through POST .../transition,
// and an edit must send If-Match with the version it read, so two people can't overwrite each
// other: a stale version answers 412 with the task as it is now.
import { Router } from "express";
import { currentUser, membership, requireRole, visibleProject, visibleTask } from "../auth.ts";
import { now } from "../clock.ts";
import { nextId, readDb, writeDb, type Db, type Status, type TaskRow } from "../db.ts";
import { chars, fail, intParam, isDate, labelName, parseId, readBody, searchParams, type FieldErrors } from "../problems.ts";
import { compareText, etag, taskView, userById, userRef } from "../views.ts";

export const tasksRoutes = Router();

const STATUSES: readonly Status[] = ["todo", "doing", "done"];
const SORTS = ["due", "priority", "created", "title"] as const;

interface TaskInput {
  title: string;
  description: string | null;
  priority: number;
  due_on: string | null;
  assignee_id: number | null;
}
const TASK_FIELDS = { title: "string", description: "string?", priority: "integer", due_on: "string?", assignee_id: "integer?" } as const;

tasksRoutes.get("/projects/:projectId/tasks", (req, res) => {
  const db = readDb();
  const project = visibleProject(db, currentUser(res), parseId(req.params.projectId, "project_id"));
  const query = searchParams(req);

  const status = query.get("status");
  if (status !== null && !STATUSES.includes(status as Status)) fail(400, "status must be todo, doing, or done", { status: "must be todo, doing, or done" });
  const assignee = query.get("assignee_id");
  if (assignee !== null && !/^([1-9][0-9]*|none)$/.test(assignee)) fail(400, "assignee_id must be a user id or none", { assignee_id: "must be a user id or none" });
  const q = query.get("q");
  if (q !== null && (chars(q) < 2 || chars(q) > 100)) fail(400, "q must be 2 to 100 characters", { q: "must be 2 to 100 characters" });
  const sort = query.get("sort") ?? "created";
  if (!SORTS.includes(sort as (typeof SORTS)[number])) fail(400, "sort must be due, priority, created, or title", { sort: "must be due, priority, created, or title" });
  const order = query.get("order") ?? "asc";
  if (order !== "asc" && order !== "desc") fail(400, "order must be asc or desc", { order: "must be asc or desc" });
  const limit = intParam(query, "limit", { min: 1, max: 100, fallback: 20 });
  const offset = intParam(query, "offset", { min: 0, fallback: 0 });
  const label = query.get("label");
  if (label !== null && (chars(labelName(label)) < 1 || chars(labelName(label)) > 30)) fail(400, "label must be 1 to 30 characters", { label: "must be 1 to 30 characters" });

  let rows = db.tasks.filter((t) => t.project_id === project.id);
  if (status !== null) rows = rows.filter((t) => t.status === status);
  if (assignee !== null) rows = rows.filter((t) => (assignee === "none" ? t.assignee_id === null : t.assignee_id === Number(assignee)));
  if (q !== null) {
    // includes() treats %, _, and \ as the characters they are, which is what the contract asks.
    const needle = q.toLowerCase();
    rows = rows.filter((t) => t.title.toLowerCase().includes(needle) || (t.description ?? "").toLowerCase().includes(needle));
  }
  if (label !== null) {
    const match = db.labels.find((l) => l.project_id === project.id && l.name === labelName(label));
    rows = match ? rows.filter((t) => db.task_labels.some((tl) => tl.task_id === t.id && tl.label_id === match.id)) : [];
  }
  rows = rows.toSorted(compareTasks(sort as (typeof SORTS)[number], order === "desc" ? -1 : 1));

  res.json({ items: rows.slice(offset, offset + limit).map((t) => taskView(db, t)), total: rows.length, limit, offset });
});

/** Ties break by id. Tasks without a due date go last in either order. */
function compareTasks(sort: (typeof SORTS)[number], direction: 1 | -1) {
  const key = {
    created: (t: TaskRow) => t.created_at,
    due: (t: TaskRow) => t.due_on,
    priority: (t: TaskRow) => t.priority,
    title: (t: TaskRow) => t.title.toLowerCase(),
  }[sort];
  return (a: TaskRow, b: TaskRow): number => {
    const ka = key(a);
    const kb = key(b);
    if (ka === null || kb === null) return ka === kb ? a.id - b.id : ka === null ? 1 : -1;
    const order = typeof ka === "number" && typeof kb === "number" ? ka - kb : compareText(String(ka), String(kb));
    return direction * Math.sign(order) || a.id - b.id;
  };
}

tasksRoutes.post("/projects/:projectId/tasks", (req, res) => {
  const db = readDb();
  const user = currentUser(res);
  const project = visibleProject(db, user, parseId(req.params.projectId, "project_id"));
  requireRole(db, user, project.id, "member");
  const body = readBody<TaskInput>(req, TASK_FIELDS);
  const errors: FieldErrors = {};
  if (body.title === undefined) errors.title = "is required";
  checkTaskFields(db, body, errors, project.id);
  if (Object.keys(errors).length > 0) fail(422, "the task is not valid", errors);

  const stamp = now();
  const task: TaskRow = {
    id: nextId(db, "tasks"),
    project_id: project.id,
    title: body.title!.trim(),
    description: body.description ?? null,
    status: "todo",
    priority: body.priority ?? 2,
    due_on: body.due_on ?? null,
    assignee_id: body.assignee_id ?? null,
    version: 1,
    completed_at: null,
    created_at: stamp,
    updated_at: stamp,
  };
  db.tasks.push(task);
  writeDb(db);
  res.status(201).location(`/v1/tasks/${task.id}`).set("ETag", etag(task)).json(taskView(db, task));
});

tasksRoutes.get("/tasks/:taskId", (req, res) => {
  const db = readDb();
  const task = visibleTask(db, currentUser(res), parseId(req.params.taskId, "task_id"));
  res.set("ETag", etag(task)).json(taskView(db, task));
});

tasksRoutes.patch("/tasks/:taskId", (req, res) => {
  const db = readDb();
  const user = currentUser(res);
  const task = visibleTask(db, user, parseId(req.params.taskId, "task_id"));
  requireRole(db, user, task.project_id, "member");
  const body = readBody<TaskInput>(req, TASK_FIELDS);
  const ifMatch = req.get("If-Match");
  if (ifMatch === undefined) fail(428, "send If-Match with the task's ETag");
  if (ifMatch.trim() !== etag(task)) fail(412, "the task changed since you read it", undefined, { current: taskView(db, task) });
  if (Object.keys(body).length === 0) fail(422, "send at least one field to change");
  const errors: FieldErrors = {};
  checkTaskFields(db, body, errors, task.project_id);
  if (Object.keys(errors).length > 0) fail(422, "the task is not valid", errors);

  if (body.title !== undefined) task.title = body.title.trim();
  if (body.description !== undefined) task.description = body.description;
  if (body.priority !== undefined) task.priority = body.priority;
  if (body.due_on !== undefined) task.due_on = body.due_on;
  if (body.assignee_id !== undefined) task.assignee_id = body.assignee_id;
  task.version += 1;
  task.updated_at = now();
  writeDb(db);
  res.set("ETag", etag(task)).json(taskView(db, task));
});

tasksRoutes.delete("/tasks/:taskId", (req, res) => {
  const db = readDb();
  const user = currentUser(res);
  const task = visibleTask(db, user, parseId(req.params.taskId, "task_id"));
  requireRole(db, user, task.project_id, "owner");
  db.tasks = db.tasks.filter((t) => t.id !== task.id);
  db.comments = db.comments.filter((c) => c.task_id !== task.id);
  db.task_watchers = db.task_watchers.filter((w) => w.task_id !== task.id);
  db.task_labels = db.task_labels.filter((tl) => tl.task_id !== task.id);
  writeDb(db);
  res.status(204).end();
});

/** todo goes to doing or done, doing to todo or done, and done only back to doing (reopening). */
tasksRoutes.post("/tasks/:taskId/transition", (req, res) => {
  const db = readDb();
  const user = currentUser(res);
  const task = visibleTask(db, user, parseId(req.params.taskId, "task_id"));
  requireRole(db, user, task.project_id, "member");
  const { to } = readBody<{ to: string }>(req, { to: "string" });
  if (to === undefined) fail(422, "the transition is not valid", { to: "is required" });
  if (!STATUSES.includes(to as Status)) fail(422, "the transition is not valid", { to: "must be todo, doing, or done" });
  if (to === task.status) fail(422, "the task already has that status", { to: `the task is already ${to}` });
  if (task.status === "done" && to === "todo") fail(422, "a done task can only be reopened to doing", { to: "a done task can only move back to doing" });

  task.status = to as Status;
  task.completed_at = to === "done" ? now() : null;
  task.version += 1;
  task.updated_at = now();
  writeDb(db);
  res.set("ETag", etag(task)).json(taskView(db, task));
});

// ---------------------------------------------------------------- watchers

tasksRoutes.get("/tasks/:taskId/watchers", (req, res) => {
  const db = readDb();
  const task = visibleTask(db, currentUser(res), parseId(req.params.taskId, "task_id"));
  const watchers = db.task_watchers.filter((w) => w.task_id === task.id).toSorted((a, b) => a.user_id - b.user_id);
  res.json(watchers.map((w) => userRef(userById(db, w.user_id)!)));
});

tasksRoutes.put("/tasks/:taskId/watchers/:userId", (req, res) => {
  const db = readDb();
  const user = currentUser(res);
  const task = visibleTask(db, user, parseId(req.params.taskId, "task_id"));
  const userId = parseId(req.params.userId, "user_id");
  requireRole(db, user, task.project_id, "member");
  if (!userById(db, userId) || !membership(db, task.project_id, userId)) {
    fail(422, "a watcher must be a member of the project", { user_id: "is not a member of this project" });
  }
  if (!db.task_watchers.some((w) => w.task_id === task.id && w.user_id === userId)) {
    db.task_watchers.push({ task_id: task.id, user_id: userId });
    writeDb(db);
  }
  res.status(204).end();
});

tasksRoutes.delete("/tasks/:taskId/watchers/:userId", (req, res) => {
  const db = readDb();
  const user = currentUser(res);
  const task = visibleTask(db, user, parseId(req.params.taskId, "task_id"));
  const userId = parseId(req.params.userId, "user_id");
  requireRole(db, user, task.project_id, "member");
  db.task_watchers = db.task_watchers.filter((w) => !(w.task_id === task.id && w.user_id === userId));
  writeDb(db);
  res.status(204).end();
});

// ---------------------------------------------------------------- labels on a task (the labels tier)

const MAX_LABELS_PER_TASK = 5;

tasksRoutes.put("/tasks/:taskId/labels/:labelId", (req, res) => {
  const db = readDb();
  const user = currentUser(res);
  const task = visibleTask(db, user, parseId(req.params.taskId, "task_id"));
  const labelId = parseId(req.params.labelId, "label_id");
  requireRole(db, user, task.project_id, "member");
  const label = db.labels.find((l) => l.id === labelId);
  if (!label || label.project_id !== task.project_id) fail(422, "the label is not one of this project's labels", { label_id: "is not a label of this project" });
  const carried = db.task_labels.filter((tl) => tl.task_id === task.id);
  if (!carried.some((tl) => tl.label_id === labelId)) {
    if (carried.length >= MAX_LABELS_PER_TASK) fail(409, `a task carries at most ${MAX_LABELS_PER_TASK} labels`);
    db.task_labels.push({ task_id: task.id, label_id: labelId });
    writeDb(db);
  }
  res.status(204).end();
});

tasksRoutes.delete("/tasks/:taskId/labels/:labelId", (req, res) => {
  const db = readDb();
  const user = currentUser(res);
  const task = visibleTask(db, user, parseId(req.params.taskId, "task_id"));
  const labelId = parseId(req.params.labelId, "label_id");
  requireRole(db, user, task.project_id, "member");
  db.task_labels = db.task_labels.filter((tl) => !(tl.task_id === task.id && tl.label_id === labelId));
  writeDb(db);
  res.status(204).end();
});

/** Value rules shared by create and edit. */
function checkTaskFields(db: Db, body: Partial<TaskInput>, errors: FieldErrors, projectId: number): void {
  if (body.title !== undefined) {
    const title = body.title.trim();
    if (chars(title) < 1) errors.title = "is required";
    else if (chars(title) > 120) errors.title = "must be at most 120 characters";
  }
  if (typeof body.description === "string" && chars(body.description) > 2000) errors.description = "must be at most 2000 characters";
  if (body.priority !== undefined && (body.priority < 1 || body.priority > 3)) errors.priority = "must be 1, 2, or 3";
  if (typeof body.due_on === "string" && !isDate(body.due_on)) errors.due_on = "must be a date like 2026-10-31";
  if (typeof body.assignee_id === "number") {
    const m = membership(db, projectId, body.assignee_id);
    if (!m || m.role === "viewer") errors.assignee_id = "must be a member of the project";
  }
}
