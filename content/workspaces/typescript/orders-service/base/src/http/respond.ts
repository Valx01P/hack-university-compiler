// Writing responses. JSON bodies go out through json(), and errors through problem(), which
// uses the standard problem format (RFC 9457, application/problem+json), so a client reads
// every error the same way: a status, a title, a detail, and our code and issues.
import { STATUS_CODES, type ServerResponse } from "node:http";
import type { Issue } from "#domain/errors.ts";

export type Headers = Readonly<Record<string, string>>;

export function json(res: ServerResponse, status: number, body: unknown, headers: Headers = {}): void {
  send(res, status, "application/json; charset=utf-8", body, headers);
}

export type ProblemDetails = {
  /** What went wrong, in words a person can act on. */
  readonly detail: string;
  /** A stable, machine-readable name, such as invalid_transition. */
  readonly code?: string;
  readonly issues?: readonly Issue[];
};

export function problem(res: ServerResponse, status: number, details: ProblemDetails, headers: Headers = {}): void {
  const body = { type: "about:blank", title: STATUS_CODES[status] ?? "Error", status, ...details };
  send(res, status, "application/problem+json; charset=utf-8", body, headers);
}

function send(res: ServerResponse, status: number, type: string, body: unknown, headers: Headers): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { ...headers, "content-type": type, "content-length": String(Buffer.byteLength(text)) });
  res.end(text);
}
