// Projects, their members, their status counts, and their labels (the contract's optional labels
// tier). You see the projects you belong to; an admin may also read any project by id. Owners
// rename projects and add members; any member may create labels.
import { Router } from "express";
import { currentUser, membership, requireRole, visibleProject } from "../auth.ts";
import { now } from "../clock.ts";
import { nextId, readDb, writeDb, type Db, type ProjectRole, type ProjectRow } from "../db.ts";
import { chars, COLOR, fail, labelName, parseId, readBody, type FieldErrors } from "../problems.ts";
import { compareText, labelView, membersView, projectListItem, projectView, taskCounts, userById } from "../views.ts";

export const projectsRoutes = Router();

interface ProjectInput {
  name: string;
  description: string | null;
  color: string | null;
}

projectsRoutes.get("/projects", (_req, res) => {
  const db = readDb();
  const user = currentUser(res);
  const mine = db.project_members
    .filter((m) => m.user_id === user.id)
    .map((m) => ({ project: db.projects.find((p) => p.id === m.project_id)!, role: m.role }))
    .toSorted((a, b) => a.project.id - b.project.id);
  res.json(mine.map(({ project, role }) => projectListItem(db, project, role)));
});

projectsRoutes.post("/projects", (req, res) => {
  const body = readBody<ProjectInput>(req, { name: "string", description: "string?", color: "string?" });
  const db = readDb();
  const user = currentUser(res);
  const errors: FieldErrors = {};
  if (body.name === undefined) errors.name = "is required";
  checkProjectFields(db, body, errors, user.id, null);
  if (Object.keys(errors).length > 0) fail(422, "the project is not valid", errors);

  const project: ProjectRow = {
    id: nextId(db, "projects"),
    name: body.name!.trim(),
    description: body.description ?? null,
    color: body.color ?? "#64748b",
    owner_id: user.id,
    created_at: now(),
  };
  db.projects.push(project);
  db.project_members.push({ project_id: project.id, user_id: user.id, role: "owner" });
  writeDb(db);
  res.status(201).location(`/v1/projects/${project.id}`).json(projectView(db, project));
});

projectsRoutes.get("/projects/:projectId", (req, res) => {
  const db = readDb();
  res.json(projectView(db, visibleProject(db, currentUser(res), parseId(req.params.projectId, "project_id"))));
});

projectsRoutes.patch("/projects/:projectId", (req, res) => {
  const db = readDb();
  const user = currentUser(res);
  const project = visibleProject(db, user, parseId(req.params.projectId, "project_id"));
  requireRole(db, user, project.id, "owner");
  const body = readBody<ProjectInput>(req, { name: "string", description: "string?", color: "string?" });
  if (Object.keys(body).length === 0) fail(422, "send at least one field to change");
  const errors: FieldErrors = {};
  checkProjectFields(db, body, errors, project.owner_id, project.id);
  if (Object.keys(errors).length > 0) fail(422, "the project is not valid", errors);

  if (body.name !== undefined) project.name = body.name.trim();
  if (body.description !== undefined) project.description = body.description;
  if (body.color !== undefined && body.color !== null) project.color = body.color;
  writeDb(db);
  res.json(projectView(db, project));
});

projectsRoutes.post("/projects/:projectId/members", (req, res) => {
  const db = readDb();
  const user = currentUser(res);
  const project = visibleProject(db, user, parseId(req.params.projectId, "project_id"));
  requireRole(db, user, project.id, "owner");
  const body = readBody<{ user_id: number; role: string }>(req, { user_id: "integer", role: "string" });
  const errors: FieldErrors = {};
  if (body.user_id === undefined) errors.user_id = "is required";
  else if (!userById(db, body.user_id)) errors.user_id = "is not a user";
  const role = body.role ?? "member";
  if (role !== "owner" && role !== "member") errors.role = "must be owner or member";
  if (Object.keys(errors).length > 0) fail(422, "the membership is not valid", errors);
  if (membership(db, project.id, body.user_id!)) fail(409, "that user is already a member", { user_id: "is already a member" });

  db.project_members.push({ project_id: project.id, user_id: body.user_id!, role: role as ProjectRole });
  writeDb(db);
  res.status(201).json(membersView(db, project.id).find((m) => m.user_id === body.user_id));
});

projectsRoutes.get("/projects/:projectId/stats", (req, res) => {
  const db = readDb();
  const project = visibleProject(db, currentUser(res), parseId(req.params.projectId, "project_id"));
  res.json(taskCounts(db, project.id));
});

// ---------------------------------------------------------------- labels (the labels tier)

projectsRoutes.get("/projects/:projectId/labels", (req, res) => {
  const db = readDb();
  const project = visibleProject(db, currentUser(res), parseId(req.params.projectId, "project_id"));
  const labels = db.labels.filter((l) => l.project_id === project.id).toSorted((a, b) => compareText(a.name, b.name) || a.id - b.id);
  res.json(labels.map((l) => labelView(db, l)));
});

projectsRoutes.post("/projects/:projectId/labels", (req, res) => {
  const db = readDb();
  const user = currentUser(res);
  const project = visibleProject(db, user, parseId(req.params.projectId, "project_id"));
  requireRole(db, user, project.id, "member");
  const body = readBody<{ name: string; color: string }>(req, { name: "string", color: "string" });
  const errors: FieldErrors = {};
  const name = body.name === undefined ? undefined : labelName(body.name);
  if (name === undefined) errors.name = "is required";
  else if (chars(name) < 1 || chars(name) > 30) errors.name = "must be 1 to 30 characters";
  if (body.color !== undefined && !COLOR.test(body.color)) errors.color = "must be #rrggbb in lowercase hex";
  if (Object.keys(errors).length > 0) fail(422, "the label is not valid", errors);
  if (db.labels.some((l) => l.project_id === project.id && l.name === name)) fail(409, "the project has a label with this name", { name: "is already a label in this project" });

  const label = { id: nextId(db, "labels"), project_id: project.id, name: name!, color: body.color ?? "#6b7280" };
  db.labels.push(label);
  writeDb(db);
  res.status(201).json(labelView(db, label));
});

/** Name rules shared by create and rename: 3 to 100 characters, unique per owner in any letter case. */
function checkProjectFields(db: Db, body: Partial<ProjectInput>, errors: FieldErrors, ownerId: number, selfId: number | null): void {
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (chars(name) < 3 || chars(name) > 100) errors.name = "must be 3 to 100 characters";
    else if (db.projects.some((p) => p.owner_id === ownerId && p.id !== selfId && p.name.toLowerCase() === name.toLowerCase())) {
      fail(409, "you already have a project with this name", { name: "is already used by another of your projects" });
    }
  }
  if (typeof body.description === "string" && chars(body.description) > 500) errors.description = "must be at most 500 characters";
  if (body.color !== undefined && (body.color === null || !COLOR.test(body.color))) errors.color = "must be #rrggbb in lowercase hex";
}
