// validate({ body, params, query }) checks each part of a request against a zod schema before
// the handler runs, and answers one 400 problem listing every bad field. Handlers then trust
// the parsed values: req.body is replaced, and params and query land in res.locals, because
// Express 5 makes req.query a read-only getter.
import type { RequestHandler } from "express";
import { z } from "zod";
import { type FieldError, ValidationError } from "./errors.ts";

export type RequestSchemas = { body?: z.ZodType; params?: z.ZodType; query?: z.ZodType };

export function toFieldErrors(error: z.ZodError, part: string): FieldError[] {
  return error.issues.map((issue) => ({
    field: issue.path.length > 0 ? issue.path.join(".") : part,
    message: issue.message,
  }));
}

export function validate(schemas: RequestSchemas): RequestHandler {
  return (req, res, next) => {
    const errors: FieldError[] = [];
    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (result.success) res.locals.params = result.data;
      else errors.push(...toFieldErrors(result.error, "params"));
    }
    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (result.success) res.locals.query = result.data;
      else errors.push(...toFieldErrors(result.error, "query"));
    }
    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (result.success) req.body = result.data;
      else errors.push(...toFieldErrors(result.error, "body"));
    }
    if (errors.length > 0) {
      throw new ValidationError(errors.sort((a, b) => a.field.localeCompare(b.field)));
    }
    next();
  };
}

/** A path id: digits only, so "12abc" and "1e3" fail instead of becoming numbers. */
export const idParam = z
  .string()
  .regex(/^[1-9]\d{0,9}$/, "Expected a positive whole number")
  .transform(Number)
  .pipe(z.number().max(2_147_483_647, "Too big"));

/** A query key that may repeat (?category=music&category=talk): one value arrives as a string. */
export function oneOrMany<T extends z.ZodType<unknown, string>>(item: T, max = 10) {
  return z
    .union([z.string(), z.array(z.string())])
    .transform((value) => (Array.isArray(value) ? value : [value]))
    .pipe(z.array(item).max(max));
}
