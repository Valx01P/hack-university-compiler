// How failures become HTTP responses. A DomainError from a service maps to 404, 409, or 422,
// and httpStatusFor is exhaustive: add a member to the DomainError union and this file stops
// compiling until the new member has a status. HttpError is for what the HTTP layer finds
// itself: a malformed body (400), a bad query string (400), an unknown route (404 or 405),
// or a body that is too big (413).
import type { ServerResponse } from "node:http";
import type { DomainError, Issue } from "#domain/errors.ts";
import { problem, type Headers } from "./respond.ts";

export function httpStatusFor(error: DomainError): 404 | 409 | 422 {
  switch (error.type) {
    case "not_found":
      return 404;
    case "invalid_transition":
    case "out_of_stock":
      return 409;
    case "validation":
      return 422;
  }
}

function detailFor(error: DomainError): string {
  switch (error.type) {
    case "not_found":
      return error.entity === "product" ? `No product with SKU ${error.id}` : `No ${error.entity} with id ${error.id}`;
    case "invalid_transition":
      return `A ${error.from} order cannot be ${error.to}`;
    case "out_of_stock":
      return `Only ${error.available} of ${error.sku} left, and the order asks for ${error.requested}`;
    case "validation":
      return "The request has invalid fields";
  }
}

export function sendDomainError(res: ServerResponse, error: DomainError): void {
  problem(res, httpStatusFor(error), {
    detail: detailFor(error),
    code: error.type,
    ...(error.type === "validation" ? { issues: error.issues } : {}),
  });
}

export class HttpError extends Error {
  readonly status: 400 | 404 | 405 | 413 | 422;
  readonly issues: readonly Issue[];
  readonly headers: Headers;

  constructor(status: 400 | 404 | 405 | 413 | 422, detail: string, options: { readonly issues?: readonly Issue[]; readonly headers?: Headers } = {}) {
    super(detail);
    this.name = "HttpError";
    this.status = status;
    this.issues = options.issues ?? [];
    this.headers = options.headers ?? {};
  }
}

export function sendHttpError(res: ServerResponse, error: HttpError): void {
  problem(res, error.status, { detail: error.message, ...(error.issues.length > 0 ? { issues: error.issues } : {}) }, error.headers);
}
