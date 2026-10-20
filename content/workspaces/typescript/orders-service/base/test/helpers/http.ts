// Starts the real app on a free port for HTTP tests: port 0 lets the system pick one, so
// tests never collide with each other or with the dev server.
import { createServer } from "node:http";
import { createApp, type App } from "../../src/app.ts";
import { fixedClock } from "../../src/clock.ts";
import { createLogger } from "../../src/logger.ts";
import { dailyReport } from "../../src/reports/daily.ts";
import { sqliteRepositories } from "#repositories/sqlite/repositories.ts";
import { demoDatabase, demoMemoryRepositories } from "./demo.ts";

export type TestServer = { readonly baseUrl: string; readonly app: App; readonly close: () => Promise<void> };

export async function startApp(storage: "memory" | "sqlite" = "memory"): Promise<TestServer> {
  const clock = fixedClock("2026-10-01T09:00:00Z");
  const logger = createLogger({ level: "silent", clock });
  const db = storage === "sqlite" ? demoDatabase() : null;
  const app = db
    ? createApp({ repositories: sqliteRepositories(db), clock, logger, dailyReport: (date) => dailyReport(db, date) })
    : createApp({ repositories: demoMemoryRepositories(), clock, logger });
  const server = createServer(app.handle);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  // address() is a string for a pipe and null before listening, so narrow it before .port.
  const address = server.address();
  if (typeof address !== "object" || address === null) throw new Error("The test server is not on TCP");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    app,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          db?.close();
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}

/** Sends JSON and reads the reply as unknown, for the test to check with a schema. */
export async function send(baseUrl: string, method: string, path: string, body?: unknown): Promise<{ status: number; type: string | null; json: unknown; headers: Headers }> {
  const res = await fetch(baseUrl + path, {
    method,
    ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
  const json: unknown = await res.json();
  return { status: res.status, type: res.headers.get("content-type"), json, headers: res.headers };
}
