import type http from "node:http";
import type { ZodType } from "zod";
import { describeIssues } from "./schemas.ts";

/**
 * What every REST route shares: one error shape, JSON answers, and bodies
 * read with a cap (JSON, or a file's raw bytes).
 */

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  /** More fields for the error body, like a conflict's current etag. */
  readonly extra: Record<string, unknown>;
  constructor(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export function send(res: http.ServerResponse, status: number, body?: unknown, headers: Record<string, string> = {}) {
  const payload = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(status, {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...(payload ? { "Content-Type": "application/json; charset=utf-8", "Content-Length": String(Buffer.byteLength(payload)) } : {}),
    ...headers,
  });
  res.end(payload);
}

/** Raw bytes, for file reads. */
export function sendBytes(res: http.ServerResponse, data: Buffer, headers: Record<string, string>) {
  res.writeHead(200, {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Length": String(data.length),
    ...headers,
  });
  res.end(data);
}

export function sendError(res: http.ServerResponse, err: HttpError) {
  send(res, err.status, { error: err.code, message: err.message, ...err.extra }, err.status === 401 ? { "WWW-Authenticate": "Bearer" } : {});
}

/** Reads and parses a JSON body of at most `limit` bytes. */
export async function readJson(req: http.IncomingMessage, limit: number): Promise<unknown> {
  const type = req.headers["content-type"] ?? "";
  if (!/^application\/json\s*(;|$)/i.test(type)) throw new HttpError(415, "unsupported_media_type", "Send a JSON body (Content-Type: application/json).");
  const body = await readRaw(req, limit);
  try {
    return JSON.parse(body.toString("utf8"));
  } catch {
    throw new HttpError(400, "bad_request", "The body isn't valid JSON.");
  }
}

/** Reads a body of at most `limit` bytes as it is. */
export async function readRaw(req: http.IncomingMessage, limit: number): Promise<Buffer> {
  const declared = Number(req.headers["content-length"] ?? 0);
  if (declared > limit) throw new HttpError(413, "too_large", `The body is over ${limit} bytes.`);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, "too_large", `The body is over ${limit} bytes.`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function parse<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new HttpError(400, "bad_request", describeIssues(result.error));
  return result.data;
}

export function methodNotAllowed(allowed: string): HttpError {
  return new HttpError(405, "method_not_allowed", `Use ${allowed}.`);
}
