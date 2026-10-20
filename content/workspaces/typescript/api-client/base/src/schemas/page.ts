// Parcelly's list responses: a page of items and the cursor for the next page, which is null
// on the last page. pageOf builds the schema for a page of any item schema.
import * as z from "zod";

export function pageOf<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), nextCursor: z.string().nullable() });
}
