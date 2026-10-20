// Keyset (cursor) pagination helpers. A cursor holds the sort keys of the last row a page
// showed, and the next page continues after it with a row comparison such as
// (starts_at, id) > ($1, $2). Unlike OFFSET it never skips or repeats rows when rows are added,
// and it stays fast deep into a table. Clients treat the cursor as an opaque string.
import { z } from "zod";
import { ValidationError } from "./errors.ts";

/** What a cursor holds: the sort it belongs to, the last row's sort value, and its id (the tiebreaker). */
export const Cursor = z.strictObject({
  sort: z.string().min(1).max(40),
  key: z.string().max(500),
  id: z.int().positive().max(2_147_483_647),
});
export type Cursor = z.infer<typeof Cursor>;

export type Page<T> = { data: T[]; nextCursor: string | null };

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

/**
 * Reads a cursor a client sent back. Anything that is not one this API made (bad base64,
 * bad JSON, a negative id, another sort's cursor) is a 400 for the `cursor` field.
 */
export function decodeCursor(raw: string, expected: { sort: string; key?: z.ZodType<string> }): Cursor {
  const invalid = (message: string) => new ValidationError([{ field: "cursor", message }]);
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    throw invalid("Not a cursor this API made");
  }
  const result = Cursor.safeParse(json);
  if (!result.success) throw invalid("Not a cursor this API made");
  if (result.data.sort !== expected.sort) throw invalid(`This cursor belongs to sort=${result.data.sort}`);
  if (expected.key !== undefined && !expected.key.safeParse(result.data.key).success) {
    throw invalid("Not a cursor this API made");
  }
  return result.data;
}

/** The limit query parameter: a whole number from 1 to max, or the default when absent. */
export function limitQuery(defaultLimit: number, max = 50) {
  return z.coerce.number().int().min(1).max(max).default(defaultLimit);
}

/**
 * Turns limit + 1 rows into a page: the extra row only proves a next page exists, and the
 * cursor points after the last row shown.
 */
export function toPage<T>(rows: T[], limit: number, cursorOf: (row: T) => Cursor): Page<T> {
  if (rows.length <= limit) return { data: rows, nextCursor: null };
  const data = rows.slice(0, limit);
  return { data, nextCursor: encodeCursor(cursorOf(data[data.length - 1] as T)) };
}
