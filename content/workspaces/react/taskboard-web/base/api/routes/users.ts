// GET /v1/users?q=: people whose name or email contains q, for the Team page and for adding members.
// This mock answers slowly on purpose, and slower for shorter searches (520 ms for one character,
// 80 ms less per extra character, at least 120 ms), so fast typing gets answers out of order:
// the race that lesson 30 shows and fixes.
import { Router } from "express";
import { latency } from "../chaos.ts";
import { readDb } from "../db.ts";
import { chars, fail, searchParams } from "../problems.ts";
import { compareText, userSummary } from "../views.ts";

export const usersRoutes = Router();

export const searchLatency = (q: string): number => (q === "" ? 120 : Math.max(120, 520 - 80 * (chars(q) - 1)));

usersRoutes.get(
  "/users",
  latency((req) => searchLatency(searchParams(req).get("q") ?? "")),
  (req, res) => {
    const q = searchParams(req).get("q") ?? "";
    if (chars(q) > 100) fail(400, "q must be at most 100 characters", { q: "must be at most 100 characters" });
    const needle = q.toLowerCase();
    const found = readDb()
      .users.filter((u) => u.name.toLowerCase().includes(needle) || u.email.includes(needle))
      .toSorted((a, b) => compareText(a.name.toLowerCase(), b.name.toLowerCase()) || a.id - b.id)
      .slice(0, 20);
    res.json(found.map(userSummary));
  },
);
