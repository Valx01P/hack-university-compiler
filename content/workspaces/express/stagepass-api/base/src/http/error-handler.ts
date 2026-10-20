// The last two middleware in createApp(). notFound answers routes nothing matched, and
// errorHandler turns every error any layer throws into one RFC 9457 problem
// (application/problem+json). Only unexpected errors are logged, once, and their messages
// never reach the client.
import type { ErrorRequestHandler, Request, RequestHandler } from "express";
import { MulterError } from "multer";
import { ZodError } from "zod";
import { pgConstraint, pgErrorCode } from "../db/tx.ts";
import { AppError, NotFoundError, UnauthorizedError } from "./errors.ts";
import { toFieldErrors } from "./validate.ts";

export type Problem = {
  type: string;
  title: string;
  status: number;
  detail?: string;
  [extension: string]: unknown;
};

const plain = (status: number, title: string, detail?: string): Problem =>
  detail === undefined ? { type: "about:blank", title, status } : { type: "about:blank", title, status, detail };

/** Errors that body-parser (express.json) throws carry a `type` such as "entity.parse.failed". */
function bodyParserProblem(err: { type: string; status?: number; limit?: number }): Problem | undefined {
  switch (err.type) {
    case "entity.parse.failed":
      return plain(400, "Bad Request", "The body is not valid JSON");
    case "entity.too.large":
      return plain(413, "Content Too Large", `The body is larger than ${err.limit ?? "the limit of"} bytes`);
    case "encoding.unsupported":
    case "charset.unsupported":
      return plain(415, "Unsupported Media Type", "Send the body as UTF-8 JSON");
    case "request.aborted":
    case "request.size.invalid":
      return plain(400, "Bad Request", "The body did not arrive whole");
    default:
      return err.status !== undefined && err.status < 500 ? plain(err.status, "Bad Request") : undefined;
  }
}

function multerProblem(err: MulterError): Problem {
  if (err.code === "LIMIT_FILE_SIZE") return plain(413, "Content Too Large", "The file is larger than the limit");
  const field = err.field === undefined ? {} : { field: err.field };
  return { ...plain(400, "Bad Request", err.message), ...field };
}

/** PostgreSQL rule violations that reached this far: a constraint was the last line of defense. */
function databaseProblem(code: string, constraint: string | undefined): Problem | undefined {
  const named = constraint === undefined ? {} : { constraint };
  switch (code) {
    case "23505": // unique_violation
      return { ...plain(409, "Conflict", "This would duplicate a value that must be unique"), ...named };
    case "23503": // foreign_key_violation
      return { ...plain(422, "Unprocessable Content", "This refers to a record that does not exist"), ...named };
    case "23514": // check_violation
      return { ...plain(422, "Unprocessable Content", "This breaks a rule the data must follow"), ...named };
    case "22P02": // invalid_text_representation
    case "22003": // numeric_value_out_of_range
    case "22007": // invalid_datetime_format
    case "22008": // datetime_field_overflow
      return plain(400, "Bad Request", "A value has the wrong type or is out of range");
    case "57014": // query_canceled, which statement_timeout causes
      return plain(503, "Service Unavailable", "The database took too long to answer");
    default:
      return undefined;
  }
}

/** Maps any thrown value to a problem. Pure, so it is easy to test. */
export function toProblem(err: unknown): Problem {
  if (err instanceof AppError) {
    const problem: Problem = { type: err.type, title: err.title, status: err.status, ...err.extra };
    return err.message === "" ? problem : { ...problem, detail: err.message };
  }
  if (err instanceof ZodError) {
    return { ...plain(400, "Bad Request", "The request has invalid fields"), errors: toFieldErrors(err, "body") };
  }
  if (err instanceof MulterError) return multerProblem(err);
  // A body that is not valid multipart (busboy cannot parse it) reaches here through multer,
  // which marks every error it forwards with a storageErrors list.
  if (err instanceof Error && Array.isArray((err as { storageErrors?: unknown }).storageErrors)) {
    return plain(400, "Bad Request", `The multipart body is malformed: ${err.message}`);
  }
  if (typeof err === "object" && err !== null && typeof (err as { type?: unknown }).type === "string") {
    const problem = bodyParserProblem(err as { type: string; status?: number; limit?: number });
    if (problem !== undefined) return problem;
  }
  const code = pgErrorCode(err);
  if (code !== undefined) {
    const problem = databaseProblem(code, pgConstraint(err));
    if (problem !== undefined) return problem;
  }
  return plain(500, "Internal Server Error");
}

function isBrowserPage(req: Request): boolean {
  return !req.path.startsWith("/v1") && req.accepts(["json", "html"]) === "html";
}

/** Routes nothing matched: the HTML 404 page for browsers, a problem for API clients. */
export const notFound: RequestHandler = (req, res) => {
  if (isBrowserPage(req)) {
    res.status(404).render("not-found", { title: "Page not found" });
    return;
  }
  throw new NotFoundError(`No route ${req.method} ${req.path}`);
};

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    // Too late for a problem response: let Express close the connection.
    req.log.warn({ err }, "error after the response started");
    next(err);
    return;
  }
  const problem = toProblem(err);
  // 503s are expected while a dependency is down or during shutdown: a warning, not an error.
  if (problem.status === 503) req.log.warn({ err }, "service unavailable");
  else if (problem.status >= 500) req.log.error({ err }, "request failed");

  if (err instanceof UnauthorizedError) res.set("WWW-Authenticate", err.challenge);
  // The request id travels in the X-Request-Id header, so two answers to the same mistake are
  // byte-identical (a login must not differ between "no such user" and "wrong password").
  res.status(problem.status).type("application/problem+json").json({ ...problem, instance: req.originalUrl });
};
