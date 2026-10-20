// Routes only wire: a path, the middleware it needs, and the controller method. Mounted at /v1.
import { type RequestHandler, Router } from "express";
import type { AuthGuards } from "../../http/auth.ts";
import { noStore } from "../../http/cache-control.ts";
import type { RouteDoc } from "../../http/openapi.ts";
import { validate } from "../../http/validate.ts";
import type { AuthController } from "./auth.controller.ts";
import { Login, RefreshTokenBody, SessionResponse, Signup, UserResponse } from "./auth.schemas.ts";

export type AuthRoutesDeps = { controller: AuthController; auth: AuthGuards; authLimiter: RequestHandler };

export function authRoutes({ controller, auth, authLimiter }: AuthRoutesDeps): Router {
  const router = Router();
  router.post("/auth/signup", authLimiter, validate({ body: Signup }), controller.signup);
  router.post("/auth/login", authLimiter, validate({ body: Login }), controller.login);
  router.post("/auth/refresh", validate({ body: RefreshTokenBody }), controller.refresh);
  router.post("/auth/logout", validate({ body: RefreshTokenBody }), controller.logout);
  router.get("/me", auth.required, noStore, controller.me);
  return router;
}

export const authDocs: RouteDoc[] = [
  {
    method: "post",
    path: "/v1/auth/signup",
    summary: "Create a customer account and log in",
    tag: "auth",
    body: { schema: Signup },
    responses: {
      201: { description: "The new account's session", schema: SessionResponse },
      400: { description: "Invalid fields" },
      409: { description: "The email already has an account" },
      429: { description: "Too many attempts" },
    },
  },
  {
    method: "post",
    path: "/v1/auth/login",
    summary: "Log in with email and password",
    tag: "auth",
    body: { schema: Login },
    responses: {
      200: { description: "A session: an access token and a refresh token", schema: SessionResponse },
      401: { description: "Invalid email or password" },
      429: { description: "Too many attempts" },
    },
  },
  {
    method: "post",
    path: "/v1/auth/refresh",
    summary: "Trade a refresh token for a new pair",
    tag: "auth",
    body: { schema: RefreshTokenBody },
    responses: {
      200: { description: "A new session. The refresh token sent is now revoked", schema: SessionResponse },
      401: { description: "Unknown, expired, or reused refresh token" },
    },
  },
  {
    method: "post",
    path: "/v1/auth/logout",
    summary: "End the login a refresh token belongs to",
    tag: "auth",
    body: { schema: RefreshTokenBody },
    responses: { 204: { description: "Logged out" } },
  },
  {
    method: "get",
    path: "/v1/me",
    summary: "The logged-in user",
    tag: "auth",
    auth: "required",
    responses: { 200: { description: "You", schema: UserResponse }, 401: { description: "Not logged in" } },
  },
];
