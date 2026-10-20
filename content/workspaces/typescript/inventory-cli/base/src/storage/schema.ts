// What a valid inventory file looks like, as zod schemas. This is the edge where the file's
// untyped JSON becomes typed data: loadInventory runs every file through InventoryFile, and
// the InventoryFile type is inferred from the same schema, so the two can never disagree.
import * as z from "zod";
import { CATEGORIES, isCents, isSku, toCents, type Cents, type Sku } from "#domain/index.ts";
import { migrateV1 } from "./migrate.ts";

// z.custom keeps the domain's brands: what passes the check comes out as Sku and Cents.
export const SkuField = z.custom<Sku>((value) => typeof value === "string" && isSku(value), "expected AAA-000");
const CentsField = z.custom<Cents>(
  (value) => typeof value === "number" && isCents(value) && value >= 0,
  "expected a whole number of cents, 0 or more",
);

const ItemFields = {
  sku: SkuField,
  name: z.string().min(1, "expected a name"),
  category: z.enum(CATEGORIES),
  qty: z.number().int("expected a whole number").min(0, "expected 0 or more"),
  updatedAt: z.iso.datetime(),
};

export const ItemV2 = z.object({ ...ItemFields, priceCents: CentsField });

export const InventoryV2 = z
  .object({ version: z.literal(2), items: z.array(ItemV2) })
  // Zod runs this only once every item is valid, so a duplicate shows up after the
  // other problems in a file are fixed.
  .superRefine((file, context) => {
    const seen = new Set<string>();
    file.items.forEach((item, index) => {
      if (seen.has(item.sku)) context.addIssue({ code: "custom", path: ["items", index, "sku"], message: `duplicate SKU ${item.sku}` });
      seen.add(item.sku);
    });
  });

// Version 1 files kept prices as text ("12.50"). The transform turns them into cents while
// parsing, and migrateV1 finishes the upgrade.
export const PriceText = z.string().transform((text, context) => {
  const parsed = toCents(text);
  if (parsed.ok) return parsed.value;
  context.addIssue({ code: "custom", message: "expected a price like 12.50" });
  return z.NEVER;
});

export const InventoryV1 = z.object({
  version: z.literal(1),
  items: z.array(z.object({ ...ItemFields, price: PriceText })),
});
export type InventoryV1 = z.output<typeof InventoryV1>;

/** Any inventory file Stockroom can read, upgraded to version 2 on the way in. */
export const InventoryFile = z
  .discriminatedUnion("version", [InventoryV2, InventoryV1])
  .transform((file) => (file.version === 1 ? migrateV1(file) : file));
export type InventoryFile = z.output<typeof InventoryFile>;
