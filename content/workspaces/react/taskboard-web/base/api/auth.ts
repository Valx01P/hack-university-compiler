// Who is calling, and what they may do. Login creates a session: a random token saved in db.json
// with the user's id and an expiry 24 hours after the clock. Clients send it back as
// "Authorization: Bearer <token>" or as the tb_session cookie that login sets (HttpOnly, so page
// scripts can't read it). When the Authorization header is present it alone decides.
import { randomBytes } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { hoursAfter, now } from "./clock.ts";
import { nextId, readDb, writeDb, type Db, type ProjectRow, type TaskRow, type UserRow } from "./db.ts";
import { chars, fail, isEmail, normalizeEmail, readBody } from "./problems.ts";
import { userById, userView } from "./views.ts";

export const SESSION_COOKIE = "tb_session";

export const authRoutes = Router();

authRoutes.post("/auth/signup", (req, res) => {
  const body = readBody<{ email: string; name: string; password: string }>(req, { email: "string", name: "string", password: "string" });
  const errors: Record<string, string> = {};
  const email = body.email === undefined ? undefined : normalizeEmail(body.email);
  const name = body.name?.trim();
  if (email === undefined) errors.email = "is required";
  else if (!isEmail(email)) errors.email = "must be an email address";
  if (name === undefined) errors.name = "is required";
  else if (chars(name) < 1 || chars(name) > 50) errors.name = "must be 1 to 50 characters";
  if (body.password === undefined) errors.password = "is required";
  else if (chars(body.password) < 12 || Buffer.byteLength(body.password) > 72) errors.password = "must be 12 characters to 72 bytes";
  if (Object.keys(errors).length > 0) fail(422, "the signup is not valid", errors);

  const db = readDb();
  if (db.users.some((u) => u.email === email)) fail(409, "an account with this email exists", { email: "is already registered" });
  const user: UserRow = { id: nextId(db, "users"), name: name!, email: email!, role: "member", created_at: now(), password: body.password! };
  db.users.push(user);
  writeDb(db);
  res.status(201).json(userView(user));
});

authRoutes.post("/auth/login", (req, res) => {
  const body = readBody<{ email: string; password: string }>(req, { email: "string", password: "string" });
  const errors: Record<string, string> = {};
  if (body.email === undefined) errors.email = "is required";
  if (body.password === undefined) errors.password = "is required";
  if (Object.keys(errors).length > 0) fail(422, "the login is not valid", errors);

  const db = readDb();
  const user = db.users.find((u) => u.email === normalizeEmail(body.email!));
  // The same answer for an unknown email and a wrong password, so nobody can probe for accounts.
  if (!user || user.password !== body.password) fail(401, "wrong email or password");
  const token = randomBytes(24).toString("base64url");
  const expiresAt = hoursAfter(now(), 24);
  db.sessions.push({ token, user_id: user.id, expires_at: expiresAt });
  writeDb(db);
  // No Expires or Max-Age (the fixed clock is in the past, so a browser would drop the cookie at
  // once), and no Secure, which Safari enforces even on http://localhost.
  res.append("Set-Cookie", `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/`);
  res.json({ token, expires_at: expiresAt, user: userView(user) });
});

authRoutes.post("/auth/logout", requireUser, (_req, res) => {
  const db = readDb();
  db.sessions = db.sessions.filter((s) => s.token !== res.locals.token);
  writeDb(db);
  res.append("Set-Cookie", `${SESSION_COOKIE}=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/`);
  res.status(204).end();
});

authRoutes.get("/me", requireUser, (_req, res) => {
  res.json(userView(currentUser(res)));
});

/** Middleware: loads the caller's user into res.locals, or answers 401. */
export function requireUser(req: Request, res: Response, next: NextFunction): void {
  const token = tokenOf(req);
  const db = readDb();
  const session = db.sessions.find((s) => s.token === token);
  if (!session || session.expires_at <= now()) fail(401, "log in to continue");
  res.locals.user = userById(db, session.user_id);
  res.locals.token = token;
  next();
}

export function currentUser(res: Response): UserRow {
  return res.locals.user as UserRow;
}

function tokenOf(req: Request): string {
  const header = req.get("Authorization");
  if (header !== undefined) {
    const match = /^Bearer\s+(\S+)$/i.exec(header);
    if (!match) fail(401, "send Authorization: Bearer <token>");
    return match[1]!;
  }
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) fail(401, "log in to continue");
  return token;
}

function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.get("Cookie") ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

// ---------------------------------------------------------------- who may see and change what

export function membership(db: Db, projectId: number, userId: number) {
  return db.project_members.find((m) => m.project_id === projectId && m.user_id === userId);
}

/** The project when the user may see it (a member, or an admin), else 404. Never 403: that would confirm it exists. */
export function visibleProject(db: Db, user: UserRow, projectId: number): ProjectRow {
  const project = db.projects.find((p) => p.id === projectId);
  if (!project || (!membership(db, projectId, user.id) && user.role !== "admin")) fail(404, `project ${projectId} not found`);
  return project;
}

export function visibleTask(db: Db, user: UserRow, taskId: number): TaskRow {
  const task = db.tasks.find((t) => t.id === taskId);
  if (!task || (!membership(db, task.project_id, user.id) && user.role !== "admin")) fail(404, `task ${taskId} not found`);
  return task;
}

/**
 * 403 unless the user is a member of the project (role "member"), or its owner (role "owner").
 * Admins read every project but change only the ones they belong to.
 */
export function requireRole(db: Db, user: UserRow, projectId: number, role: "member" | "owner"): void {
  const m = membership(db, projectId, user.id);
  if (!m || m.role === "viewer") fail(403, "only members of this project can do that");
  if (role === "owner" && m.role !== "owner") fail(403, "only owners of this project can do that");
}
