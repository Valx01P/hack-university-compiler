// The Taskboard mock API: an Express 5 app that serves the Taskboard contract
// (content/contracts/taskboard/openapi.yaml) under /v1, from a JSON file instead of a database.
// Requests pass through the request log, CORS, JSON parsing, and the teaching controls, then
// reach a router in api/routes. Errors become RFC 9457 problems in the handler at the bottom.
import express, { type NextFunction, type Request, type Response } from "express";
import { authRoutes, requireUser } from "./auth.ts";
import { chaos, requestLog } from "./chaos.ts";
import { Problem, sendProblem } from "./problems.ts";
import { commentsRoutes } from "./routes/comments.ts";
import { huRoutes } from "./routes/hu.ts";
import { projectsRoutes } from "./routes/projects.ts";
import { tasksRoutes } from "./routes/tasks.ts";
import { usersRoutes } from "./routes/users.ts";

const PORT = Number(process.env.API_PORT ?? process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? "0.0.0.0";
// Exact origins that may call the API from another port with cookies, such as a React client
// started with npm run dev:web against this API. Same-origin requests through Vite's proxy need none.
const CORS_ORIGINS = new Set((process.env.CORS_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean));

const app = express();
app.disable("x-powered-by");
// Only tasks carry an ETag (their version), so Express's automatic ones stay off.
app.set("etag", false);

app.use(requestLog);
app.use(cors);
app.use(express.json({ limit: "100kb", type: ["application/json", "application/*+json"] }));

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});
app.get("/readyz", (_req, res) => {
  res.json({ status: "ready", checks: { store: "ok" } });
});
app.use("/_hu", huRoutes);

const v1 = express.Router();
v1.use(authRoutes); // signup and login are public, logout and /me check the session themselves
v1.use(requireUser); // every route below needs a session
v1.use(usersRoutes, projectsRoutes, tasksRoutes, commentsRoutes);
app.use("/v1", chaos, v1);

app.use((req, _res, next) => {
  next(new Problem(404, `no route for ${req.method} ${req.path}`));
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof Problem) return sendProblem(res, error);
  const parseError = error as { type?: string; status?: number };
  if (parseError.type === "entity.parse.failed") return sendProblem(res, new Problem(400, "the body is not valid JSON"));
  if (parseError.type === "entity.too.large") return sendProblem(res, new Problem(413, "the body is larger than 100 kB"));
  console.error(error);
  sendProblem(res, new Problem(500, "something went wrong in the API"));
});

/** Answers preflights, and lets listed origins read responses and send the session cookie. */
function cors(req: Request, res: Response, next: NextFunction): void {
  const origin = req.get("Origin");
  const allowed = origin !== undefined && CORS_ORIGINS.has(origin);
  if (allowed) {
    res.set({ "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true" });
    res.vary("Origin");
  }
  if (req.method === "OPTIONS" && req.get("Access-Control-Request-Method")) {
    if (allowed) {
      res.set({
        "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE",
        "Access-Control-Allow-Headers": "Authorization, Content-Type, If-Match, X-HU-Delay, X-HU-Fail",
        "Access-Control-Max-Age": "600",
      });
    }
    res.status(204).end();
    return;
  }
  next();
}

app.listen(PORT, HOST, (error?: Error) => {
  if (error) throw error;
  console.log(`Taskboard mock API on http://localhost:${PORT} (data in api/data/db.json)`);
});
