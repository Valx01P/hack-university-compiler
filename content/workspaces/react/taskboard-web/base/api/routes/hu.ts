// Hooks for Hack University's checks, outside /v1 and outside the Taskboard contract: the request
// log, a reset to the seed, and the stored rows. A check resets the data, drives the app, then
// reads /_hu/log or /_hu/state to see what reached the API. No real API would expose these.
import { Router } from "express";
import { clearRequestLog, recentRequests } from "../chaos.ts";
import { readDb, resetDb } from "../db.ts";

export const huRoutes = Router();

huRoutes.get("/log", (_req, res) => {
  res.json({ items: recentRequests() });
});

huRoutes.post("/reset", (_req, res) => {
  resetDb();
  clearRequestLog();
  res.status(204).end();
});

/** Every table, without passwords or session tokens. */
huRoutes.get("/state", (_req, res) => {
  const { about: _about, users, sessions, ...rest } = readDb();
  res.json({
    ...rest,
    users: users.map(({ password: _password, ...user }) => user),
    sessions: sessions.map(({ user_id, expires_at }) => ({ user_id, expires_at })),
  });
});
