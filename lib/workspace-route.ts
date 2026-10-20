import { NextResponse } from "next/server";
import type * as z from "zod";
import { describeIssues } from "@/lib/workspace-schemas";
import { RunnerError } from "@/lib/runner";

/**
 * What the workspace routes (app/api/workspaces, app/api/tickets) share:
 * one error shape, `{ error, code }`, where `error` is a sentence the IDE
 * can show as it is; JSON bodies read with a byte cap and checked against
 * their zod schema; and the runner's answers passed back with only the
 * headers the IDE needs.
 */

export const JSON_MAX_BYTES = 1_000_000;

export function fail(error: string, status: number, code = "bad_request") {
  return NextResponse.json({ error, code }, { status, headers: { "Cache-Control": "no-store" } });
}

export class BodyError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** A request's body, at most `max` bytes, as bytes. */
export async function readBytes(request: Request, max: number): Promise<Uint8Array> {
  if (Number(request.headers.get("content-length") ?? 0) > max) throw new BodyError(`The request is over ${max} bytes.`, 413);
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel().catch(() => {});
      throw new BodyError(`The request is over ${max} bytes.`, 413);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/** A JSON body checked against its schema. */
export async function readBody<T>(request: Request, schema: z.ZodType<T>, max = JSON_MAX_BYTES): Promise<T> {
  const raw = await readBytes(request, max);
  let data: unknown;
  try {
    data = raw.length ? JSON.parse(new TextDecoder().decode(raw)) : {};
  } catch {
    throw new BodyError("Expected a JSON body.", 400);
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new BodyError(describeIssues(parsed.error), 400);
  return parsed.data;
}

/** The answer for an error thrown while handling a workspace request. */
export function errorResponse(err: unknown) {
  if (err instanceof BodyError) return fail(err.message, err.status, err.status === 413 ? "too_large" : "bad_request");
  if (err instanceof RunnerError) return fail(err.message, err.status, err.status === 503 ? "runner_down" : "runner_error");
  console.error("workspace request failed:", err);
  return fail("The workspace hit an unexpected error. Try again.", 500, "internal");
}

// The runner's answers keep these headers, and nothing else of its own.
const PASS_HEADERS = ["content-type", "etag", "content-disposition", "last-modified"];

/** A runner answer passed back to the browser. Errors come back as
    `{ error, code }`, the runner's message first. */
export async function relay(res: Response): Promise<Response> {
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: unknown; message?: unknown } | null;
    const code = typeof data?.error === "string" ? data.error : "runner_error";
    const message =
      typeof data?.message === "string" && data.message
        ? data.message
        : res.status === 401 || res.status === 403
          ? "The runner didn't accept this app's token. Restart the app with npm run up."
          : `The workspace runner answered ${res.status}.`;
    return NextResponse.json({ ...(data ?? {}), error: message, code }, { status: res.status, headers: { "Cache-Control": "no-store" } });
  }
  const headers = new Headers({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  for (const name of PASS_HEADERS) {
    const value = res.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(res.status === 204 ? null : res.body, { status: res.status, headers });
}
