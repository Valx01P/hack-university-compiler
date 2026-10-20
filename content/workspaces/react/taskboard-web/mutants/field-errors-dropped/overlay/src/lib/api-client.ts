// The one place the app talks HTTP. apiFetch prefixes the API's base path, sends and parses JSON,
// carries the session cookie, and turns every error response into an ApiError built from the
// API's RFC 9457 problem, whose errors member maps fields to messages for forms to show.
const BASE = (import.meta.env.VITE_API_BASE || "/v1").replace(/\/$/, "");

// Same-origin requests (through Vite's proxy) send cookies by default. A backend on another
// origin, such as http://localhost:23017/v1, needs "include", and CORS_ORIGINS on its side.
const CREDENTIALS: RequestCredentials = /^https?:\/\//.test(BASE) ? "include" : "same-origin";

export interface Problem {
  type: string;
  title: string;
  status: number;
  detail?: string;
  errors?: Record<string, string>;
  [member: string]: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly title: string;
  /** Field name to message, from the problem's errors: { title: "is required" }. */
  readonly fieldErrors: Record<string, string>;
  readonly problem: Problem;

  constructor(problem: Problem) {
    super(problem.detail || problem.title);
    this.name = "ApiError";
    this.status = problem.status;
    this.title = problem.title;
    this.fieldErrors = {};
    this.problem = problem;
  }
}

export interface ApiOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

let unauthorizedHandler: (() => void) | null = null;

/** Registers what to do when any request answers 401 (the auth feature does). Returns an undo. */
export function onUnauthorized(handler: () => void): () => void {
  unauthorizedHandler = handler;
  return () => {
    if (unauthorizedHandler === handler) unauthorizedHandler = null;
  };
}

export async function apiFetch<T>(path: string, { method = "GET", body, headers, signal }: ApiOptions = {}): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    signal,
    credentials: CREDENTIALS,
    headers: {
      Accept: "application/json",
      ...(body !== undefined && { "Content-Type": "application/json" }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    if (response.status === 401) unauthorizedHandler?.();
    throw new ApiError(await readProblem(response));
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** The problem in an error response, or one made from the status when the body isn't JSON. */
async function readProblem(response: Response): Promise<Problem> {
  const fallback: Problem = { type: "about:blank", title: response.statusText || "Request failed", status: response.status };
  if (!/json/.test(response.headers.get("Content-Type") ?? "")) return fallback;
  try {
    return { ...fallback, ...((await response.json()) as Partial<Problem>), status: response.status };
  } catch {
    return fallback;
  }
}

/** "title" and "is required" become "Title is required", the sentence a form shows. */
export function fieldMessage(label: string, message: string | undefined): string | undefined {
  return message === undefined ? undefined : `${label} ${message}`;
}
