// What the collection routes accept: the create body, the :id param, and the :slug param for
// adding a recipe to a collection.
import * as z from "zod";

export const CreateCollectionBody = z.strictObject({
  name: z.string().trim().min(1).max(80),
});

export const CollectionIdParam = z.object({
  id: z.string().trim().min(1).max(200),
});

export const CollectionRecipeParams = z.object({
  id: z.string().trim().min(1).max(200),
  slug: z.string().trim().min(1).max(200),
});

export type CreateCollectionInput = z.infer<typeof CreateCollectionBody>;
