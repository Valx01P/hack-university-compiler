// MSW handlers that mirror the mock API (api/) for tests: the same routes, shapes, and rules the
// app relies on, kept in memory and reset after every test. They are simpler than the real API
// (no chaos headers, an opaque cursor of their own), and tests override single answers with
// server.use(). signInAs() picks who the "browser" is logged in as.
import { http, HttpResponse, type HttpResponseResolver, type PathParams } from "msw";
import { fixtures, PASSWORD, USERS, type SeedUser } from "./fixtures";

const NOW = "2026-10-01T09:00:00Z";

function createDb() {
  return {
    users: structuredClone(fixtures.users),
    projects: structuredClone(fixtures.projects),
    members: structuredClone(fixtures.members),
    tasks: structuredClone(fixtures.tasks),
    comments: structuredClone(fixtures.comments),
    watchers: structuredClone(fixtures.watchers),
    labels: structuredClone(fixtures.labels),
    taskLabels: structuredClone(fixtures.taskLabels),
    nextId: { projects: 4, tasks: 19, comments: 32 },
  };
}

let db = createDb();
let sessionUserId: number | null = USERS.ada;

/** The fake API's data, for tests that assert what reached the server. */
export const mockDb = () => db;

export function signInAs(user: SeedUser | null): void {
  sessionUserId = user === null ? null : USERS[user];
}

export function resetMockApi(): void {
  db = createDb();
  sessionUserId = USERS.ada;
}

// ---------------------------------------------------------------- helpers

function problem(status: number, detail: string, errors?: Record<string, string>) {
  const title = { 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 409: "Conflict", 412: "Precondition Failed", 422: "Unprocessable Content" }[status] ?? "Error";
  return HttpResponse.json({ type: "about:blank", title, status, detail, ...(errors && { errors }) }, { status, headers: { "Content-Type": "application/problem+json" } });
}

const noContent = () => new HttpResponse(null, { status: 204 });
const me = () => db.users.find((u) => u.id === sessionUserId);
const roleOf = (projectId: number, userId: number) => db.members.find((m) => m.project_id === projectId && m.user_id === userId)?.role;
const canSee = (projectId: number) => roleOf(projectId, sessionUserId!) !== undefined || me()?.role === "admin";

function labelsOf(taskId: number) {
  return db.taskLabels
    .filter((tl) => tl.task_id === taskId)
    .map((tl) => db.labels.find((l) => l.id === tl.label_id)!)
    .toSorted((a, b) => (a.name < b.name ? -1 : 1))
    .map(({ id, name, color }) => ({ id, name, color }));
}

const taskView = (task: (typeof db.tasks)[number]) => ({ ...task, labels: labelsOf(task.id) });

function projectView(id: number) {
  const project = db.projects.find((p) => p.id === id)!;
  const members = db.members
    .filter((m) => m.project_id === id)
    .toSorted((a, b) => a.user_id - b.user_id)
    .map((m) => {
      const user = db.users.find((u) => u.id === m.user_id)!;
      return { user_id: user.id, name: user.name, email: user.email, role: m.role };
    });
  return { ...project, members };
}

function counts(projectId: number) {
  const result = { todo: 0, doing: 0, done: 0 };
  for (const task of db.tasks) if (task.project_id === projectId) result[task.status] += 1;
  return result;
}

/** Answers 401 unless someone is signed in, like the API's requireUser, then runs the resolver. */
function authed<Params extends PathParams>(resolver: HttpResponseResolver<Params>): HttpResponseResolver<Params> {
  return (info) => (me() ? resolver(info) : problem(401, "log in to continue"));
}

function findTask(id: number) {
  const task = db.tasks.find((t) => t.id === id);
  return task && canSee(task.project_id) ? task : undefined;
}

// ---------------------------------------------------------------- handlers

export const handlers = [
  http.post("/v1/auth/login", async ({ request }) => {
    const { email, password } = (await request.json()) as { email: string; password: string };
    const user = db.users.find((u) => u.email === email.trim().toLowerCase());
    if (!user || password !== PASSWORD) return problem(401, "wrong email or password");
    sessionUserId = user.id;
    return HttpResponse.json({ token: "test-session-token", expires_at: "2026-10-02T09:00:00Z", user });
  }),

  http.post("/v1/auth/logout", () => {
    sessionUserId = null;
    return noContent();
  }),

  http.get("/v1/me", () => {
    const user = me();
    return user ? HttpResponse.json(user) : problem(401, "log in to continue");
  }),

  http.get(
    "/v1/users",
    authed(({ request }) => {
      const q = (new URL(request.url).searchParams.get("q") ?? "").toLowerCase();
      const found = db.users.filter((u) => u.name.toLowerCase().includes(q) || u.email.includes(q)).toSorted((a, b) => a.name.localeCompare(b.name));
      return HttpResponse.json(found.map(({ id, name, email }) => ({ id, name, email })));
    }),
  ),

  http.get(
    "/v1/projects",
    authed(() => {
      const mine = db.members.filter((m) => m.user_id === sessionUserId).toSorted((a, b) => a.project_id - b.project_id);
      return HttpResponse.json(
        mine.map((m) => {
          const { members: _members, ...project } = projectView(m.project_id);
          return { ...project, role: m.role, task_counts: counts(m.project_id) };
        }),
      );
    }),
  ),

  http.post(
    "/v1/projects",
    authed(async ({ request }) => {
      const body = (await request.json()) as { name: string; description?: string | null; color?: string };
      const name = body.name.trim();
      if (name.length < 3) return problem(422, "the project is not valid", { name: "must be 3 to 100 characters" });
      if (db.projects.some((p) => p.owner_id === sessionUserId && p.name.toLowerCase() === name.toLowerCase())) {
        return problem(409, "you already have a project with this name", { name: "is already used by another of your projects" });
      }
      const id = db.nextId.projects++;
      db.projects.push({ id, name, description: body.description ?? null, color: body.color ?? "#64748b", owner_id: sessionUserId!, created_at: NOW });
      db.members.push({ project_id: id, user_id: sessionUserId!, role: "owner" });
      return HttpResponse.json(projectView(id), { status: 201 });
    }),
  ),

  http.get(
    "/v1/projects/:projectId",
    authed(({ params }) => {
      const id = Number(params.projectId);
      return db.projects.some((p) => p.id === id) && canSee(id) ? HttpResponse.json(projectView(id)) : problem(404, `project ${id} not found`);
    }),
  ),

  http.patch(
    "/v1/projects/:projectId",
    authed(async ({ params, request }) => {
      const id = Number(params.projectId);
      const project = db.projects.find((p) => p.id === id);
      if (!project || !canSee(id)) return problem(404, `project ${id} not found`);
      if (roleOf(id, sessionUserId!) !== "owner") return problem(403, "only owners of this project can do that");
      const { name } = (await request.json()) as { name: string };
      if (name.trim().length < 3) return problem(422, "the project is not valid", { name: "must be 3 to 100 characters" });
      if (db.projects.some((p) => p.owner_id === project.owner_id && p.id !== id && p.name.toLowerCase() === name.trim().toLowerCase())) {
        return problem(409, "you already have a project with this name", { name: "is already used by another of your projects" });
      }
      project.name = name.trim();
      return HttpResponse.json(projectView(id));
    }),
  ),

  http.get(
    "/v1/projects/:projectId/stats",
    authed(({ params }) => {
      const id = Number(params.projectId);
      return canSee(id) ? HttpResponse.json(counts(id)) : problem(404, `project ${id} not found`);
    }),
  ),

  http.get(
    "/v1/projects/:projectId/labels",
    authed(({ params }) => {
      const id = Number(params.projectId);
      if (!canSee(id)) return problem(404, `project ${id} not found`);
      const labels = db.labels.filter((l) => l.project_id === id).toSorted((a, b) => (a.name < b.name ? -1 : 1));
      return HttpResponse.json(labels.map((l) => ({ ...l, task_count: db.taskLabels.filter((tl) => tl.label_id === l.id).length })));
    }),
  ),

  http.get(
    "/v1/projects/:projectId/tasks",
    authed(({ params, request }) => {
      const id = Number(params.projectId);
      if (!db.projects.some((p) => p.id === id) || !canSee(id)) return problem(404, `project ${id} not found`);
      const query = new URL(request.url).searchParams;
      const status = query.get("status");
      const assignee = query.get("assignee_id");
      const q = query.get("q")?.toLowerCase();
      const label = query.get("label");
      const sort = query.get("sort") ?? "created";
      const direction = query.get("order") === "desc" ? -1 : 1;
      const limit = Number(query.get("limit") ?? 20);
      const offset = Number(query.get("offset") ?? 0);

      let rows = db.tasks.filter((t) => t.project_id === id);
      if (status) rows = rows.filter((t) => t.status === status);
      if (assignee) rows = rows.filter((t) => (assignee === "none" ? t.assignee_id === null : t.assignee_id === Number(assignee)));
      if (q) rows = rows.filter((t) => `${t.title} ${t.description ?? ""}`.toLowerCase().includes(q));
      if (label) rows = rows.filter((t) => labelsOf(t.id).some((l) => l.name === label.toLowerCase()));
      const key = (t: (typeof rows)[number]) => ({ due: t.due_on, priority: t.priority, title: t.title.toLowerCase(), created: t.created_at })[sort as "due"];
      rows = rows.toSorted((a, b) => {
        const [ka, kb] = [key(a), key(b)];
        if (ka === null || kb === null) return ka === kb ? a.id - b.id : ka === null ? 1 : -1;
        return direction * (ka < kb ? -1 : ka > kb ? 1 : 0) || a.id - b.id;
      });
      return HttpResponse.json({ items: rows.slice(offset, offset + limit).map(taskView), total: rows.length, limit, offset });
    }),
  ),

  http.post(
    "/v1/projects/:projectId/tasks",
    authed(async ({ params, request }) => {
      const projectId = Number(params.projectId);
      if (!canSee(projectId)) return problem(404, `project ${projectId} not found`);
      const body = (await request.json()) as { title: string; description?: string | null; priority?: 1 | 2 | 3; due_on?: string | null; assignee_id?: number | null };
      if (!body.title?.trim()) return problem(422, "the task is not valid", { title: "is required" });
      const task = {
        id: db.nextId.tasks++,
        project_id: projectId,
        title: body.title.trim(),
        description: body.description ?? null,
        status: "todo" as const,
        priority: body.priority ?? 2,
        due_on: body.due_on ?? null,
        assignee_id: body.assignee_id ?? null,
        version: 1,
        completed_at: null,
        created_at: NOW,
        updated_at: NOW,
      };
      db.tasks.push(task);
      return HttpResponse.json(taskView(task), { status: 201, headers: { ETag: '"v1"' } });
    }),
  ),

  http.get(
    "/v1/tasks/:taskId",
    authed(({ params }) => {
      const task = findTask(Number(params.taskId));
      return task ? HttpResponse.json(taskView(task), { headers: { ETag: `"v${task.version}"` } }) : problem(404, "task not found");
    }),
  ),

  http.patch(
    "/v1/tasks/:taskId",
    authed(async ({ params, request }) => {
      const task = findTask(Number(params.taskId));
      if (!task) return problem(404, "task not found");
      const ifMatch = request.headers.get("If-Match");
      if (!ifMatch) return problem(428, "send If-Match with the task's ETag");
      if (ifMatch !== `"v${task.version}"`) return HttpResponse.json({ type: "about:blank", title: "Precondition Failed", status: 412, detail: "the task changed since you read it", current: taskView(task) }, { status: 412 });
      const changes = (await request.json()) as Partial<typeof task>;
      if (changes.title !== undefined && !changes.title.trim()) return problem(422, "the task is not valid", { title: "is required" });
      Object.assign(task, changes, changes.title ? { title: changes.title.trim() } : {}, { version: task.version + 1, updated_at: NOW });
      return HttpResponse.json(taskView(task), { headers: { ETag: `"v${task.version}"` } });
    }),
  ),

  http.delete(
    "/v1/tasks/:taskId",
    authed(({ params }) => {
      const task = findTask(Number(params.taskId));
      if (!task) return problem(404, "task not found");
      if (roleOf(task.project_id, sessionUserId!) !== "owner") return problem(403, "only owners of this project can do that");
      db.tasks = db.tasks.filter((t) => t.id !== task.id);
      return noContent();
    }),
  ),

  http.post(
    "/v1/tasks/:taskId/transition",
    authed(async ({ params, request }) => {
      const task = findTask(Number(params.taskId));
      if (!task) return problem(404, "task not found");
      const { to } = (await request.json()) as { to: "todo" | "doing" | "done" };
      if (to === task.status || (task.status === "done" && to === "todo")) return problem(422, "the transition is not valid", { to: "is not allowed" });
      Object.assign(task, { status: to, completed_at: to === "done" ? NOW : null, version: task.version + 1, updated_at: NOW });
      return HttpResponse.json(taskView(task), { headers: { ETag: `"v${task.version}"` } });
    }),
  ),

  http.get(
    "/v1/tasks/:taskId/comments",
    authed(({ params, request }) => {
      const task = findTask(Number(params.taskId));
      if (!task) return problem(404, "task not found");
      const query = new URL(request.url).searchParams;
      const limit = Number(query.get("limit") ?? 20);
      const after = Number(query.get("cursor") ?? 0);
      const all = db.comments.filter((c) => c.task_id === task.id).toSorted((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id);
      const start = after ? all.findIndex((c) => c.id === after) + 1 : 0;
      const page = all.slice(start, start + limit);
      const author = (id: number) => {
        const user = db.users.find((u) => u.id === id)!;
        return { id: user.id, name: user.name };
      };
      return HttpResponse.json({
        items: page.map(({ author_id, ...comment }) => ({ ...comment, author: author(author_id) })),
        next_cursor: start + limit < all.length ? String(page.at(-1)!.id) : null,
      });
    }),
  ),

  http.post(
    "/v1/tasks/:taskId/comments",
    authed(async ({ params, request }) => {
      const task = findTask(Number(params.taskId));
      if (!task) return problem(404, "task not found");
      const { body } = (await request.json()) as { body: string };
      if (!body.trim()) return problem(422, "the comment is not valid", { body: "is required" });
      const user = me()!;
      const comment = { id: db.nextId.comments++, task_id: task.id, author_id: user.id, body: body.trim(), created_at: NOW };
      db.comments.push(comment);
      return HttpResponse.json({ id: comment.id, task_id: task.id, author: { id: user.id, name: user.name }, body: comment.body, created_at: NOW }, { status: 201 });
    }),
  ),

  http.delete(
    "/v1/comments/:commentId",
    authed(({ params }) => {
      const id = Number(params.commentId);
      const comment = db.comments.find((c) => c.id === id);
      const task = comment && findTask(comment.task_id);
      if (!comment || !task) return problem(404, "comment not found");
      if (comment.author_id !== sessionUserId && roleOf(task.project_id, sessionUserId!) !== "owner") return problem(403, "only the author or a project owner can delete a comment");
      db.comments = db.comments.filter((c) => c.id !== id);
      return noContent();
    }),
  ),

  http.get(
    "/v1/tasks/:taskId/watchers",
    authed(({ params }) => {
      const task = findTask(Number(params.taskId));
      if (!task) return problem(404, "task not found");
      const watchers = db.watchers.filter((w) => w.task_id === task.id).toSorted((a, b) => a.user_id - b.user_id);
      return HttpResponse.json(
        watchers.map((w) => {
          const user = db.users.find((u) => u.id === w.user_id)!;
          return { id: user.id, name: user.name };
        }),
      );
    }),
  ),

  http.put(
    "/v1/tasks/:taskId/watchers/:userId",
    authed(({ params }) => {
      const task = findTask(Number(params.taskId));
      if (!task) return problem(404, "task not found");
      const userId = Number(params.userId);
      if (!db.watchers.some((w) => w.task_id === task.id && w.user_id === userId)) db.watchers.push({ task_id: task.id, user_id: userId });
      return noContent();
    }),
  ),

  http.delete(
    "/v1/tasks/:taskId/watchers/:userId",
    authed(({ params }) => {
      const task = findTask(Number(params.taskId));
      if (!task) return problem(404, "task not found");
      db.watchers = db.watchers.filter((w) => !(w.task_id === task.id && w.user_id === Number(params.userId)));
      return noContent();
    }),
  ),

  http.put(
    "/v1/tasks/:taskId/labels/:labelId",
    authed(({ params }) => {
      const task = findTask(Number(params.taskId));
      if (!task) return problem(404, "task not found");
      const labelId = Number(params.labelId);
      const label = db.labels.find((l) => l.id === labelId);
      if (!label || label.project_id !== task.project_id) return problem(422, "the label is not one of this project's labels", { label_id: "is not a label of this project" });
      if (!db.taskLabels.some((tl) => tl.task_id === task.id && tl.label_id === labelId)) db.taskLabels.push({ task_id: task.id, label_id: labelId });
      return noContent();
    }),
  ),

  http.delete(
    "/v1/tasks/:taskId/labels/:labelId",
    authed(({ params }) => {
      const task = findTask(Number(params.taskId));
      if (!task) return problem(404, "task not found");
      db.taskLabels = db.taskLabels.filter((tl) => !(tl.task_id === task.id && tl.label_id === Number(params.labelId)));
      return noContent();
    }),
  ),

  http.post("/_hu/reset", () => {
    resetMockApi();
    sessionUserId = null;
    return noContent();
  }),
];
