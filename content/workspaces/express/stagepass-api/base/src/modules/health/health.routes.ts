// Liveness and readiness, the two questions an orchestrator asks.
// GET /healthz: is the process alive? Cheap, no dependencies, so a slow database never gets
// a healthy process restarted.
// GET /readyz: should it get traffic? 503 while shutting down or when the database does not
// answer within a second, which takes the instance out of the load balancer until it recovers.
import { Router } from "express";
import { z } from "zod";
import { ServiceUnavailableError } from "../../http/errors.ts";
import type { RouteDoc } from "../../http/openapi.ts";

/** Set once shutdown starts: from then on /readyz answers 503 while requests in flight finish. */
export class Readiness {
  #draining = false;

  drain(): void {
    this.#draining = true;
  }

  get draining(): boolean {
    return this.#draining;
  }
}

export type HealthDeps = { readiness: Readiness; checkDatabase: () => Promise<void> };

export function healthRoutes({ readiness, checkDatabase }: HealthDeps): Router {
  const router = Router();

  router.get("/healthz", (_req, res) => {
    res.set("Cache-Control", "no-store").json({ status: "ok" });
  });

  router.get("/readyz", async (_req, res) => {
    res.set("Cache-Control", "no-store");
    if (readiness.draining) throw new ServiceUnavailableError("shutting down");
    try {
      await checkDatabase();
    } catch (err) {
      throw new ServiceUnavailableError("database unavailable", { cause: err });
    }
    res.json({ status: "ready" });
  });
  return router;
}

export const healthDocs: RouteDoc[] = [
  {
    method: "get",
    path: "/healthz",
    summary: "Liveness: the process is up",
    tag: "health",
    responses: { 200: { description: "Alive", schema: z.object({ status: z.literal("ok") }) } },
  },
  {
    method: "get",
    path: "/readyz",
    summary: "Readiness: the database answers and the server is not shutting down",
    tag: "health",
    responses: {
      200: { description: "Ready for traffic", schema: z.object({ status: z.literal("ready") }) },
      503: { description: "Shutting down, or the database is unavailable" },
    },
  },
];
