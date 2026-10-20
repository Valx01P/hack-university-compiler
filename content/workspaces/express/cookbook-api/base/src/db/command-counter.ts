// Counts the database commands one request runs, so a learner can see an N+1 query for what it
// is. The driver emits a commandStarted event for every command; an AsyncLocalStorage store
// holds the per-request counter, and the middleware writes it to the X-Db-Commands response
// header. It is only wired in outside production, where the extra monitoring is free to pay for.
import { AsyncLocalStorage } from "node:async_hooks";
import type { RequestHandler } from "express";
import type { Connection } from "mongoose";

type Counter = { count: number };

const store = new AsyncLocalStorage<Counter>();

// Only the data commands count, never the driver's own heartbeat and session chatter, so the
// number a request reports is stable from run to run.
const COUNTED = new Set([
  "find",
  "aggregate",
  "count",
  "distinct",
  "insert",
  "update",
  "delete",
  "findAndModify",
]);

export function watchCommands(connection: Connection): void {
  connection.getClient().on("commandStarted", (event) => {
    if (!COUNTED.has(event.commandName)) return;
    const current = store.getStore();
    if (current) current.count += 1;
  });
}

export function countDbCommands(enabled: boolean): RequestHandler {
  if (!enabled) return (_req, _res, next) => next();
  return (_req, res, next) => {
    const counter: Counter = { count: 0 };
    const writeHeader = (): void => {
      if (!res.headersSent) res.setHeader("X-Db-Commands", String(counter.count));
    };
    const json = res.json.bind(res);
    res.json = (body: unknown) => {
      writeHeader();
      return json(body);
    };
    const end = res.end.bind(res);
    res.end = ((...args: Parameters<typeof end>) => {
      writeHeader();
      return end(...args);
    }) as typeof res.end;
    store.run(counter, () => next());
  };
}
