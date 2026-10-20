// What every request goes through around its route: a request id (taken from x-request-id
// when the client sends a sane one, and echoed back), a fresh SQL statement count, error
// handling that turns any failure into a problem response, and one access log line. readJsonBody
// is here too, with its 1 MB limit.
import type { IncomingMessage, RequestListener } from "node:http";
import { performance } from "node:perf_hooks";
import type { Logger } from "../logger.ts";
import { HttpError, sendHttpError } from "./errors.ts";
import { problem } from "./respond.ts";
import type { Router } from "./router.ts";

const MAX_BODY_BYTES = 1_000_000;

export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "The body is larger than 1 MB");
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (text.trim() === "") throw new HttpError(400, "The request needs a JSON body");
  try {
    const body: unknown = JSON.parse(text);
    return body;
  } catch {
    throw new HttpError(400, "The body is not valid JSON");
  }
}

/** How the middleware counts SQL statements per request (see query-counter.ts). */
export type QueryCounter = {
  readonly track: <T>(work: () => T) => T;
  readonly current: () => number;
};

const REQUEST_ID = /^[\w.-]{1,64}$/;

export function createRequestHandler(options: { readonly router: Router; readonly logger: Logger; readonly queries: QueryCounter }): RequestListener {
  let sequence = 0;
  return (req, res) => {
    const started = performance.now();
    const sent = req.headers["x-request-id"];
    const requestId = typeof sent === "string" && REQUEST_ID.test(sent) ? sent : `req-${++sequence}`;
    res.setHeader("x-request-id", requestId);
    const log = options.logger.child({ requestId });
    const path = new URL(req.url ?? "/", "http://localhost").pathname;

    void options.queries.track(async () => {
      try {
        await options.router.handle({ req, res, requestId, log });
      } catch (error) {
        if (res.headersSent) log.error("failed after the response started", { error: String(error) });
        else if (error instanceof HttpError) sendHttpError(res, error);
        else {
          log.error("unhandled error", { error: error instanceof Error ? (error.stack ?? error.message) : String(error) });
          problem(res, 500, { detail: `Something went wrong. The request id is ${requestId}.` });
        }
      } finally {
        log.info(`${String(req.method)} ${path} ${res.statusCode}`, {
          method: req.method,
          path,
          status: res.statusCode,
          duration_ms: Math.round(performance.now() - started),
          queries: options.queries.current(),
        });
      }
    });
  };
}
