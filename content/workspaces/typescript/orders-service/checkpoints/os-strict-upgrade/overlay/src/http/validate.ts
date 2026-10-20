// Turning untrusted input into typed values with the schemas in src/schemas. A bad query
// string is 400, and a well-formed JSON body with bad fields is 422. Every failed check
// becomes an issue with the field's path (lines[1].quantity), which the problem response
// lists.
import * as z from "zod";
import type { Issue } from "#domain/errors.ts";
import { HttpError } from "./errors.ts";

function pathOf(path: readonly PropertyKey[]): string {
  return path.reduce<string>((text, key) => (typeof key === "number" ? `${text}[${key}]` : text ? `${text}.${String(key)}` : String(key)), "");
}

export function issuesOf(error: z.ZodError): Issue[] {
  return error.issues.map((issue) => ({ path: pathOf(issue.path), message: issue.message }));
}

export function parseQuery<S extends z.ZodType>(schema: S, query: Readonly<Record<string, string | undefined>>): z.output<S> {
  const result = schema.safeParse(query);
  if (!result.success) throw new HttpError(400, "The query string is not valid", { issues: issuesOf(result.error) });
  return result.data;
}

export function parseBody<S extends z.ZodType>(schema: S, body: unknown): z.output<S> {
  const result = schema.safeParse(body);
  if (!result.success) throw new HttpError(422, "The body has invalid fields", { issues: issuesOf(result.error) });
  return result.data;
}
