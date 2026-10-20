// Errors as RFC 9457 problem objects: { type, title, status, detail, errors? }, where errors maps
// a field to its message ({ "title": "is required" }). A route throws a Problem, and the error
// handler in server.ts sends it as application/problem+json. The helpers below throw the 400s
// (a malformed request) and 422s (a well-formed request that breaks a rule) the contract defines.
import type { Request, Response } from "express";

const REASONS: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  412: "Precondition Failed",
  413: "Content Too Large",
  422: "Unprocessable Content",
  428: "Precondition Required",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
};

export type FieldErrors = Record<string, string>;

export class Problem extends Error {
  readonly status: number;
  readonly errors: FieldErrors | undefined;
  readonly extra: Record<string, unknown>;

  constructor(status: number, detail: string, errors?: FieldErrors, extra: Record<string, unknown> = {}) {
    super(detail);
    this.status = status;
    this.errors = errors;
    this.extra = extra;
  }
}

export function fail(status: number, detail: string, errors?: FieldErrors, extra?: Record<string, unknown>): never {
  throw new Problem(status, detail, errors, extra);
}

export function sendProblem(res: Response, problem: Problem): void {
  const body = {
    type: "about:blank",
    title: REASONS[problem.status] ?? "Error",
    status: problem.status,
    detail: problem.message,
    ...(problem.errors && { errors: problem.errors }),
    ...problem.extra,
  };
  if (problem.status === 401) res.setHeader("WWW-Authenticate", 'Bearer realm="taskboard"');
  res.status(problem.status).type("application/problem+json").send(JSON.stringify(body));
}

// ---------------------------------------------------------------- reading requests

type FieldType = "string" | "string?" | "integer" | "integer?";

/**
 * The JSON body as an object of known fields. Anything else is a 400: no body, a body that is not
 * an object, a field the route does not know (so nobody signs up with "role": "admin"), or a field
 * of the wrong JSON type (a priority of "high"). Rules about values (422s) are the route's job.
 */
export function readBody<T>(req: Request, fields: Record<keyof T & string, FieldType>): Partial<T> {
  const body: unknown = req.body;
  if (body === null || typeof body !== "object" || Array.isArray(body)) fail(400, "the body must be a JSON object");
  const errors: FieldErrors = {};
  for (const [key, value] of Object.entries(body)) {
    const want: FieldType | undefined = (fields as Record<string, FieldType>)[key];
    if (!want) errors[key] = "is not a known field";
    else if (!hasType(value, want)) errors[key] = `must be ${want.startsWith("integer") ? "a whole number" : "a string"}${want.endsWith("?") ? " or null" : ""}`;
  }
  if (Object.keys(errors).length > 0) fail(400, "the body has fields the API does not accept", errors);
  return body as Partial<T>;
}

function hasType(value: unknown, want: FieldType): boolean {
  if (value === null) return want.endsWith("?");
  return want.startsWith("integer") ? Number.isInteger(value) : typeof value === "string";
}

/** A path id: a positive whole number, or a 400. */
export function parseId(raw: string | string[] | undefined, name: string): number {
  if (typeof raw === "string" && /^[1-9][0-9]{0,15}$/.test(raw)) return Number(raw);
  return fail(400, `${name} must be a positive whole number`, { [name]: "must be a positive whole number" });
}

/** The query string as URLSearchParams, read the same way in every route. */
export function searchParams(req: Request): URLSearchParams {
  return new URL(req.originalUrl, "http://localhost").searchParams;
}

export function intParam(query: URLSearchParams, name: string, { min, max, fallback }: { min: number; max?: number; fallback: number }): number {
  const raw = query.get(name);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!/^-?\d+$/.test(raw) || value < min || (max !== undefined && value > max)) {
    const rule = max === undefined ? `a whole number of at least ${min}` : `a whole number from ${min} to ${max}`;
    fail(400, `${name} must be ${rule}`, { [name]: `must be ${rule}` });
  }
  return value;
}

// ---------------------------------------------------------------- values

/** Length in characters as people count them (code points), not UTF-16 units. */
export const chars = (text: string): number => [...text].length;

export const COLOR = /^#[0-9a-f]{6}$/;

/** A real calendar date in YYYY-MM-DD form: 2026-13-01 and 2026-02-30 are not. */
export function isDate(text: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]);
}

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/** One @ with something before it and a dot after it, and no spaces. */
export function isEmail(email: string): boolean {
  const at = email.indexOf("@");
  return at > 0 && email.indexOf("@", at + 1) === -1 && email.slice(at + 1).includes(".") && !/\s/.test(email);
}

/** Label names are trimmed, lowercased, and their runs of spaces collapse: "  Needs   Review " is "needs review". */
export const labelName = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, " ");
