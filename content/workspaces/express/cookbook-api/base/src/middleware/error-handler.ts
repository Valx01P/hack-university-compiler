// The single place a failure becomes a response. It maps the app's own AppError, Mongoose's
// ValidationError (400 with a field map), CastError (400, a malformed id), and a duplicate key
// (11000 to 409 with the offending keys), and a malformed JSON body (400). Anything else is an
// unexpected 500, logged once with its request id, with no internals in the body.
import type { ErrorRequestHandler } from "express";
import mongoose from "mongoose";
import { AppError } from "../errors.ts";
import type { Logger } from "../logger.ts";

type Problem = {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: string;
  fields?: Record<string, string>;
};

export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    const problem = toProblem(err);
    if (problem.status >= 500) {
      logger.error({ err, requestId: req.requestId }, "request failed");
    }
    res.status(problem.status).type("application/problem+json").json(problem);
  };
}

function toProblem(err: unknown): Problem {
  if (err instanceof AppError) {
    return { type: "about:blank", title: err.code, status: err.status, detail: err.message, code: err.code, ...(err.fields ? { fields: err.fields } : {}) };
  }

  if (err instanceof mongoose.Error.ValidationError) {
    const fields: Record<string, string> = {};
    for (const [path, detail] of Object.entries(err.errors)) fields[path] = detail.message;
    return { type: "about:blank", title: "validation_error", status: 400, detail: "The request has invalid fields", code: "validation_error", fields };
  }

  if (err instanceof mongoose.Error.CastError) {
    return { type: "about:blank", title: "invalid_value", status: 400, detail: `${err.path} is not a valid ${err.kind}`, code: "invalid_value", fields: { [err.path]: "invalid value" } };
  }

  if (isDuplicateKey(err)) {
    const fields: Record<string, string> = {};
    for (const key of Object.keys(err.keyValue)) fields[key] = "already exists";
    return { type: "about:blank", title: "conflict", status: 409, detail: "A resource with these values already exists", code: "conflict", fields };
  }

  if (isBodyParserError(err)) {
    return { type: "about:blank", title: "invalid_body", status: 400, detail: "The request body is not valid JSON", code: "invalid_body" };
  }

  return { type: "about:blank", title: "internal_error", status: 500, detail: "Something went wrong", code: "internal_error" };
}

function isDuplicateKey(err: unknown): err is { code: number; keyValue: Record<string, unknown> } {
  return typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
}

function isBodyParserError(err: unknown): err is { type: string } {
  const type = (err as { type?: string })?.type;
  return type === "entity.parse.failed" || type === "entity.too.large";
}
