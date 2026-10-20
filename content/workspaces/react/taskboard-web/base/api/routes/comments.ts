// Comments on a task, oldest first, paged by cursor: ?limit=10 gives the first 10 and a next_cursor,
// and ?cursor=<next_cursor> continues after the last one. The cursor holds the last comment's
// (created_at, id), because two comments can share a timestamp (comments 10 and 11 do).
// A comment whose body contains "#fail" answers 500, so lessons can show a rollback.
import { Router } from "express";
import { currentUser, membership, requireRole, visibleTask } from "../auth.ts";
import { now } from "../clock.ts";
import { nextId, readDb, writeDb, type CommentRow } from "../db.ts";
import { chars, fail, intParam, parseId, readBody, searchParams } from "../problems.ts";
import { commentView, compareText } from "../views.ts";

export const commentsRoutes = Router();

const encodeCursor = (c: CommentRow): string => Buffer.from(JSON.stringify({ t: c.created_at, id: c.id })).toString("base64url");

function decodeCursor(cursor: string): { t: string; id: number } {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (value && typeof value === "object" && "t" in value && "id" in value && typeof value.t === "string" && Number.isInteger(value.id) && !Number.isNaN(Date.parse(value.t))) {
      return { t: value.t, id: value.id as number };
    }
  } catch {
    // Not base64url JSON: fall through to the 400 below.
  }
  return fail(400, "cursor is not one this server issued", { cursor: "is not valid" });
}

const byTimeThenId = (a: CommentRow, b: CommentRow) => compareText(a.created_at, b.created_at) || a.id - b.id;

commentsRoutes.get("/tasks/:taskId/comments", (req, res) => {
  const db = readDb();
  const task = visibleTask(db, currentUser(res), parseId(req.params.taskId, "task_id"));
  const query = searchParams(req);
  const limit = intParam(query, "limit", { min: 1, max: 100, fallback: 20 });
  let rows = db.comments.filter((c) => c.task_id === task.id).toSorted(byTimeThenId);
  const cursor = query.get("cursor");
  if (cursor !== null) {
    const after = decodeCursor(cursor);
    rows = rows.filter((c) => c.created_at > after.t || (c.created_at === after.t && c.id > after.id));
  }
  const page = rows.slice(0, limit);
  const nextCursor = rows.length > limit ? encodeCursor(page.at(-1)!) : null;
  res.json({ items: page.map((c) => commentView(db, c)), next_cursor: nextCursor });
});

commentsRoutes.post("/tasks/:taskId/comments", (req, res) => {
  const db = readDb();
  const user = currentUser(res);
  const task = visibleTask(db, user, parseId(req.params.taskId, "task_id"));
  requireRole(db, user, task.project_id, "member");
  const body = readBody<{ body: string }>(req, { body: "string" });
  if (body.body === undefined) fail(422, "the comment is not valid", { body: "is required" });
  // Control characters (except newlines) are removed first, so a lone bell character is empty.
  const text = body.body.replace(/(?!\n)\p{Cc}/gu, "").trim();
  if (chars(text) < 1) fail(422, "the comment is not valid", { body: "is required" });
  if (chars(text) > 2000) fail(422, "the comment is not valid", { body: "must be at most 2000 characters" });
  if (text.includes("#fail")) fail(500, "the comment could not be saved (#fail is this mock's switch for a failing request)");

  const comment: CommentRow = { id: nextId(db, "comments"), task_id: task.id, author_id: user.id, body: text, created_at: now() };
  db.comments.push(comment);
  writeDb(db);
  res.status(201).json(commentView(db, comment));
});

commentsRoutes.delete("/comments/:commentId", (req, res) => {
  const db = readDb();
  const user = currentUser(res);
  const id = parseId(req.params.commentId, "comment_id");
  const comment = db.comments.find((c) => c.id === id);
  if (!comment) fail(404, `comment ${id} not found`);
  const task = visibleTask(db, user, comment.task_id);
  const isOwner = membership(db, task.project_id, user.id)?.role === "owner";
  if (comment.author_id !== user.id && !isOwner) fail(403, "only the author or a project owner can delete a comment");

  db.comments = db.comments.filter((c) => c.id !== id);
  writeDb(db);
  res.status(204).end();
});
