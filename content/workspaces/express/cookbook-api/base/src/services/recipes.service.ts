// Recipe rules that the controllers call. The model holds validation, slugging, and soft delete;
// this layer holds the rules that need the current user or span a query: only the author edits
// or deletes a recipe, and the list and search build safe filters from validated input.
import mongoose, { type Types } from "mongoose";
import { ForbiddenError, NotFoundError } from "../errors.ts";
import { RecipeModel, type Recipe } from "../models/recipe.model.ts";
import type { CreateRecipeInput, ListRecipesInput, SearchRecipesInput, UpdateRecipeInput } from "../schemas/recipes.schemas.ts";

const SORTS: Record<ListRecipesInput["sort"], Record<string, 1 | -1>> = {
  "-ratingAvg": { ratingAvg: -1, createdAt: -1 },
  ratingAvg: { ratingAvg: 1, createdAt: -1 },
  prepMinutes: { prepMinutes: 1, createdAt: -1 },
  "-prepMinutes": { prepMinutes: -1, createdAt: -1 },
  "-createdAt": { createdAt: -1 },
  createdAt: { createdAt: 1 },
};

export async function createRecipe(authorId: Types.ObjectId, input: CreateRecipeInput): Promise<Recipe> {
  return RecipeModel.create({ ...input, author: authorId });
}

export async function getRecipeBySlug(slug: string): Promise<Recipe> {
  const recipe = await RecipeModel.findOne({ slug }).populate("author", "name");
  if (!recipe) throw new NotFoundError(`No recipe with slug ${slug}`);
  return recipe;
}

export async function updateRecipe(slug: string, userId: Types.ObjectId, changes: UpdateRecipeInput): Promise<Recipe> {
  const recipe = await RecipeModel.findOne({ slug });
  if (!recipe) throw new NotFoundError(`No recipe with slug ${slug}`);
  if (String(recipe.author) !== String(userId)) throw new ForbiddenError("Only the author can edit this recipe");
  // Load, apply the allowed fields, and save, so validation and the slug hook run.
  recipe.set(changes);
  await recipe.save();
  return recipe;
}

export async function deleteRecipe(slug: string, userId: Types.ObjectId): Promise<void> {
  const recipe = await RecipeModel.findOne({ slug });
  if (!recipe) throw new NotFoundError(`No recipe with slug ${slug}`);
  if (String(recipe.author) !== String(userId)) throw new ForbiddenError("Only the author can delete this recipe");
  await recipe.softDelete();
}

export async function listRecipes(query: ListRecipesInput): Promise<{ data: Recipe[]; total: number }> {
  // sanitizeFilter is on globally, so operators written here are wrapped in trusted(); the
  // plain equality filters (cuisine, difficulty, a single tag) need no wrapping.
  const filter: Record<string, unknown> = {};
  if (query.cuisine) filter.cuisine = query.cuisine;
  if (query.difficulty) filter.difficulty = query.difficulty;
  if (query.tag) filter.tags = query.tag;
  if (query.maxMinutes) filter.prepMinutes = mongoose.trusted({ $lte: query.maxMinutes });
  if (query.q) filter.$text = mongoose.trusted({ $search: query.q });

  const total = await RecipeModel.countDocuments(filter);
  const find = RecipeModel.find(filter).populate("author", "name").skip((query.page - 1) * query.limit).limit(query.limit);
  if (query.q) {
    find.select({ score: { $meta: "textScore" } }).sort({ score: { $meta: "textScore" }, createdAt: -1 });
  } else {
    find.sort(SORTS[query.sort]);
  }
  const data = await find;
  return { data, total };
}

export async function searchRecipes(filters: SearchRecipesInput): Promise<Recipe[]> {
  // Built field by field from allowlisted input, never from a client-supplied object.
  const filter: Record<string, unknown> = {};
  if (filters.cuisine) filter.cuisine = filters.cuisine;
  if (filters.difficulty) filter.difficulty = filters.difficulty;
  if (filters.tags && filters.tags.length > 0) filter.tags = mongoose.trusted({ $all: filters.tags });
  if (filters.maxPrepMinutes) filter.prepMinutes = mongoose.trusted({ $lte: filters.maxPrepMinutes });
  if (filters.minRating) filter.ratingAvg = mongoose.trusted({ $gte: filters.minRating });
  return RecipeModel.find(filter).populate("author", "name").sort({ ratingAvg: -1, createdAt: -1 }).limit(50);
}
