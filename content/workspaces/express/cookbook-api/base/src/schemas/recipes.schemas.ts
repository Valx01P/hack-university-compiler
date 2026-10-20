// What the recipe routes accept: the create and patch bodies, the list query string, the
// allowlisted search body, and the :slug param. The search body is an allowlist on purpose, so
// a client can never hand a raw Mongo filter to find().
import * as z from "zod";
import { CUISINES, DIFFICULTIES } from "../models/recipe.model.ts";
import { UNITS } from "../models/ingredient.schema.ts";

const Ingredient = z.strictObject({
  name: z.string().trim().min(1),
  quantity: z.number().min(0),
  unit: z.enum(UNITS),
});

export const CreateRecipeBody = z.strictObject({
  title: z.string().trim().min(2).max(140),
  description: z.string().trim().max(2000).optional(),
  ingredients: z.array(Ingredient).min(1),
  steps: z.array(z.string().trim().min(1)).min(1),
  tags: z.array(z.string().trim().min(1)).max(10).default([]),
  cuisine: z.enum(CUISINES),
  difficulty: z.enum(DIFFICULTIES),
  prepMinutes: z.number().int().min(1).max(1440),
  cookMinutes: z.number().int().min(0).max(1440).optional(),
  servings: z.number().int().min(1).max(100).optional(),
  photo: z.string().url().optional(),
});

// PATCH accepts the same fields, all optional, and nothing else. author, ratingAvg, and
// ratingCount are not here, so a client cannot reassign a recipe or forge its rating.
export const UpdateRecipeBody = CreateRecipeBody.partial();

export const ListRecipesQuery = z.object({
  cuisine: z.enum(CUISINES).optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  tag: z.string().trim().min(1).optional(),
  maxMinutes: z.coerce.number().int().min(1).max(5000).optional(),
  q: z.string().trim().min(1).max(100).optional(),
  sort: z.enum(["-ratingAvg", "ratingAvg", "prepMinutes", "-prepMinutes", "-createdAt", "createdAt"]).default("-createdAt"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// The only filters POST /api/recipes/search understands. Everything else is rejected.
export const SearchRecipesBody = z.strictObject({
  cuisine: z.enum(CUISINES).optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  tags: z.array(z.string().trim().min(1)).max(10).optional(),
  maxPrepMinutes: z.number().int().min(1).max(5000).optional(),
  minRating: z.number().min(0).max(5).optional(),
});

export const SlugParam = z.object({
  slug: z.string().trim().min(1).max(200),
});

export type CreateRecipeInput = z.infer<typeof CreateRecipeBody>;
export type UpdateRecipeInput = z.infer<typeof UpdateRecipeBody>;
export type ListRecipesInput = z.infer<typeof ListRecipesQuery>;
export type SearchRecipesInput = z.infer<typeof SearchRecipesBody>;
