// Request validation with zod. Each part of the request that a route wants checked gets a
// schema; on success the parsed body replaces req.body and the parsed params and query live in
// res.locals (req.query is read-only in Express 5). On failure it throws a ValidationError with
// one message per field, which the error handler renders as a 400 problem.
import type { RequestHandler } from "express";
import type { ZodType } from "zod";
import { ValidationError } from "../errors.ts";

export type ValidationSchemas = {
  body?: ZodType;
  params?: ZodType;
  query?: ZodType;
};

export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req, res, next) => {
    const fields: Record<string, string> = {};

    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (result.success) req.body = result.data;
      else collect(result.error.issues, fields);
    }
    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (result.success) res.locals.params = result.data;
      else collect(result.error.issues, fields);
    }
    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (result.success) res.locals.query = result.data;
      else collect(result.error.issues, fields);
    }

    if (Object.keys(fields).length > 0) {
      next(new ValidationError("The request has invalid fields", fields));
      return;
    }
    next();
  };
}

function collect(issues: readonly { path: PropertyKey[]; message: string }[], fields: Record<string, string>): void {
  for (const issue of issues) {
    const key = issue.path.map(String).join(".") || "_";
    fields[key] ??= issue.message;
  }
}
