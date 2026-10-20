// Authentication and authorization middleware. requireAuth reads "Authorization: Bearer <jwt>"
// and sets req.user, or answers 401. requireRole is the coarse rule by role (403), and finer
// rules about ownership live in each module's policy file.
import type { RequestHandler } from "express";
import type { roles } from "../db/schema.ts";
import { ForbiddenError, UnauthorizedError } from "./errors.ts";

export type Role = (typeof roles)[number];
export type AuthUser = { id: number; role: Role };

export type AccessTokenVerifier = { verifyAccessToken(token: string): Promise<AuthUser> };

function bearerToken(header: string | undefined): string | null | undefined {
  if (header === undefined) return undefined;
  const match = /^Bearer ([A-Za-z0-9._~+/-]+=*)$/.exec(header);
  return match ? match[1] : null;
}

/** 401 unless the request carries a valid access token. */
export function requireAuth(tokens: AccessTokenVerifier): RequestHandler {
  return async (req, _res, next) => {
    const token = bearerToken(req.get("authorization"));
    if (token === undefined) throw new UnauthorizedError("Send an access token: Authorization: Bearer <token>");
    if (token === null) throw new UnauthorizedError("Malformed Authorization header", { invalidToken: true });
    req.user = await tokens.verifyAccessToken(token);
    next();
  };
}

/** Like requireAuth, but a request without a token passes through anonymously. */
export function optionalAuth(tokens: AccessTokenVerifier): RequestHandler {
  return async (req, _res, next) => {
    const token = bearerToken(req.get("authorization"));
    if (token === null) throw new UnauthorizedError("Malformed Authorization header", { invalidToken: true });
    if (token !== undefined) req.user = await tokens.verifyAccessToken(token);
    next();
  };
}

/** 403 unless the logged-in user has one of the roles. Goes after requireAuth. */
export function requireRole(...allowed: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (req.user === undefined) throw new UnauthorizedError();
    if (!allowed.includes(req.user.role)) {
      throw new ForbiddenError(`Only ${allowed.join(" or ")} accounts can do this`);
    }
    next();
  };
}

/** Both guards built once per app, for the routes files. */
export type AuthGuards = { required: RequestHandler; optional: RequestHandler };

export function authGuards(tokens: AccessTokenVerifier): AuthGuards {
  return { required: requireAuth(tokens), optional: optionalAuth(tokens) };
}

/** The user requireAuth set. Calling it on a route without requireAuth is a bug, so it throws. */
export function currentUser(req: { user?: AuthUser }): AuthUser {
  if (req.user === undefined) throw new Error("currentUser() on a route without requireAuth");
  return req.user;
}
