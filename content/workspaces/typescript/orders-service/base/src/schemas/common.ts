// Pieces the request schemas share: ids and SKUs that come out of parsing as the domain's
// branded types, and the page size and cursor of the list endpoints. A client sends plain
// strings, so each id starts as z.string() and pipes into the check that brands it: the
// schema's input type is string and its output type is the brand.
import * as z from "zod";
import { isCustomerId, isSku, type CustomerId, type Sku } from "#domain/ids.ts";
import { decodeCursor } from "#repositories/page.ts";

export const CustomerIdField = z
  .string()
  .pipe(z.custom<CustomerId>((value) => typeof value === "string" && isCustomerId(value), "expected a customer id like cus_01"));

export const SkuField = z.string().pipe(z.custom<Sku>((value) => typeof value === "string" && isSku(value), "expected a SKU like COF-ETH-250"));

// Query strings are text, so z.coerce turns "5" into 5 before the checks run.
export const Limit = z.coerce.number().int().min(1).max(50).default(20);

export const Cursor = z
  .string()
  .refine((text) => decodeCursor(text) !== undefined, "not a cursor from this API")
  .optional();
