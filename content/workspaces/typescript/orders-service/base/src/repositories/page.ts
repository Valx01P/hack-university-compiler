// Keyset pagination, shared by both repositories. Orders are listed newest first by
// (createdAt, id), and a cursor remembers the last order of a page, so the next page starts
// strictly after it and an order placed in between can never push a row onto two pages.
// Clients see the cursor as an opaque base64url string.
import * as z from "zod";

export type CursorKey = { readonly createdAt: string; readonly id: string };

const CursorJson = z.tuple([z.iso.datetime(), z.string().min(1)]);

export function encodeCursor(key: CursorKey): string {
  return Buffer.from(JSON.stringify([key.createdAt, key.id])).toString("base64url");
}

/** The key inside a cursor, or undefined when the text is not one this service made. */
export function decodeCursor(cursor: string): CursorKey | undefined {
  try {
    const parsed = CursorJson.safeParse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
    return parsed.success ? { createdAt: parsed.data[0], id: parsed.data[1] } : undefined;
  } catch {
    return undefined;
  }
}

/** True when an order comes after the key in newest-first order. */
export function isAfter(order: { readonly createdAt: Date; readonly id: string }, key: CursorKey): boolean {
  const createdAt = order.createdAt.toISOString();
  return createdAt < key.createdAt || (createdAt === key.createdAt && order.id < key.id);
}
