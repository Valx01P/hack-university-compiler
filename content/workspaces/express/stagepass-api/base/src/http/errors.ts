// The AppError family: failures with a name. Any layer throws one, and only the error handler
// turns it into a response (an RFC 9457 problem), so services never touch req or res.
// A problem's type is "about:blank" for plain HTTP failures, or a URI clients can switch on.
export const PROBLEM_BASE = "https://stagepass.test/problems/";

export type FieldError = { field: string; message: string };

type AppErrorOptions = {
  /** A short name for the problem type, such as "sold-out". Leave it out for about:blank. */
  type?: string;
  /** Extra members for the problem body, such as { ticketTypeId: 21 }. */
  extra?: Record<string, unknown>;
  cause?: unknown;
};

export class AppError extends Error {
  readonly status: number;
  readonly title: string;
  readonly type: string;
  readonly extra: Record<string, unknown>;

  constructor(status: number, title: string, detail: string, options: AppErrorOptions = {}) {
    super(detail, { cause: options.cause });
    this.name = new.target.name;
    this.status = status;
    this.title = title;
    this.type = options.type === undefined ? "about:blank" : `${PROBLEM_BASE}${options.type}`;
    this.extra = options.extra ?? {};
  }
}

/** 400: the request itself is malformed. `errors` names each field and what is wrong with it. */
export class ValidationError extends AppError {
  readonly errors: FieldError[];

  constructor(errors: FieldError[], detail = "The request has invalid fields") {
    super(400, "Bad Request", detail, { extra: { errors } });
    this.errors = errors;
  }
}

/** 401: log in first. `challenge` becomes the WWW-Authenticate header. */
export class UnauthorizedError extends AppError {
  readonly challenge: string;

  constructor(detail = "Log in to do this", options: { invalidToken?: boolean } = {}) {
    super(401, "Unauthorized", detail);
    this.challenge = options.invalidToken
      ? `Bearer error="invalid_token", error_description="${detail.replaceAll('"', "'")}"`
      : "Bearer";
  }
}

/** 403: logged in, but not allowed. */
export class ForbiddenError extends AppError {
  constructor(detail = "You are not allowed to do this") {
    super(403, "Forbidden", detail);
  }
}

/** 404: also used for things the caller may not know exist, so a 403 does not reveal them. */
export class NotFoundError extends AppError {
  constructor(detail: string) {
    super(404, "Not Found", detail);
  }
}

/** 409: the request is valid but clashes with the current state. */
export class ConflictError extends AppError {
  constructor(type: string, detail: string, extra: Record<string, unknown> = {}) {
    super(409, "Conflict", detail, { type, extra });
  }
}

/** 422: well formed, but it refers to something that does not exist or cannot be used. */
export class UnprocessableError extends AppError {
  constructor(errors: FieldError[], detail = "The request refers to something that cannot be used") {
    super(422, "Unprocessable Content", detail, { extra: { errors } });
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(detail: string) {
    super(413, "Content Too Large", detail);
  }
}

export class UnsupportedMediaTypeError extends AppError {
  constructor(detail: string) {
    super(415, "Unsupported Media Type", detail);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(detail = "Too many requests, try again later") {
    super(429, "Too Many Requests", detail);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(detail: string, options: { cause?: unknown } = {}) {
    super(503, "Service Unavailable", detail, { cause: options.cause });
  }
}

export class SoldOutError extends ConflictError {
  constructor(ticketType: { id: number; name: string }) {
    super("sold-out", `Not enough "${ticketType.name}" tickets left`, { ticketTypeId: ticketType.id });
  }
}

export class EventNotOnSaleError extends ConflictError {
  constructor(eventId: number, reason: string) {
    super("event-not-on-sale", `Event ${eventId} is not on sale: ${reason}`, { eventId });
  }
}
