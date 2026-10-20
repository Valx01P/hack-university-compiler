// Rate limits. authLimiter guards login and signup, where guessing passwords happens, keyed by
// address and email so one attacker cannot lock out everyone behind the same address.
// apiLimiter is a general ceiling per address (API_RATE_LIMIT_PER_MINUTE). Both keep counts in
// this process's memory, so several instances would need a shared store (Redis) instead.
import type { RequestHandler } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { TooManyRequestsError } from "./errors.ts";

const rejectWithProblem: RequestHandler = (_req, _res, next) => {
  next(new TooManyRequestsError());
};

export function authLimiter(): RequestHandler {
  return rateLimit({
    windowMs: 15 * 60_000,
    limit: 5,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    // ipKeyGenerator groups IPv6 addresses by /56, so rotating addresses inside one block does not help.
    keyGenerator: (req) => {
      const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
      return `${ipKeyGenerator(req.ip ?? "")}:${email}`;
    },
    handler: rejectWithProblem,
  });
}

/** perMinute 0 turns it off, for load tests (npm run bench) that would otherwise measure 429s. */
export function apiLimiter(perMinute: number): RequestHandler {
  if (perMinute === 0) return (_req, _res, next) => next();
  return rateLimit({
    windowMs: 60_000,
    limit: perMinute,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: rejectWithProblem,
  });
}
