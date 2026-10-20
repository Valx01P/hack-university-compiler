// Teaching controls for slow and failing requests, plus the request log. Any /v1 request may carry
// X-HU-Delay: <ms> (or ?_delay=) to answer that much later, and X-HU-Fail: <status> (or ?_fail=)
// to answer with that error instead; the Preview's Network menu sets them. Every request is
// printed to the terminal as "GET /v1/users?q=de 200 440ms" and kept for GET /_hu/log.
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { Problem, searchParams, sendProblem } from "./problems.ts";

export interface LogEntry {
  seq: number;
  method: string;
  path: string;
  status: number;
  ms: number;
}

const LOG_SIZE = 500;
const log: LogEntry[] = [];
let seq = 0;

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function requestLog(req: Request, res: Response, next: NextFunction): void {
  const started = performance.now();
  res.on("finish", () => {
    const entry = { seq: ++seq, method: req.method, path: req.originalUrl, status: res.statusCode, ms: Math.round(performance.now() - started) };
    log.push(entry);
    if (log.length > LOG_SIZE) log.shift();
    // Health probes arrive every few seconds and would bury the lines worth reading.
    if (!/^\/(healthz|readyz)\b/.test(req.path)) console.log(`${entry.method} ${entry.path} ${entry.status} ${entry.ms}ms`);
  });
  next();
}

export const recentRequests = (): LogEntry[] => [...log];

export function clearRequestLog(): void {
  log.length = 0;
}

export async function chaos(req: Request, res: Response, next: NextFunction): Promise<void> {
  const query = searchParams(req);
  const delay = Number(req.get("X-HU-Delay") ?? query.get("_delay") ?? 0);
  const failWith = Number(req.get("X-HU-Fail") ?? query.get("_fail") ?? 0);
  if (Number.isFinite(delay) && delay > 0) await sleep(Math.min(delay, 30_000));
  if (Number.isInteger(failWith) && failWith >= 400 && failWith <= 599) {
    sendProblem(res, new Problem(failWith, `failed on purpose (X-HU-Fail: ${failWith})`));
    return;
  }
  next();
}

/** Per-route latency: answers after ms(req) milliseconds. */
export function latency(ms: (req: Request) => number): RequestHandler {
  return async (req, _res, next) => {
    await sleep(ms(req));
    next();
  };
}
