// Turns a Recipe document into client JSON. The author is shown as an id, or as { id, name }
// when the query populated it, and totalMinutes is computed here too. deletedAt never leaves
// the server.
import type { Types } from "mongoose";
import type { Recipe } from "../models/recipe.model.ts";
import type { Ingredient } from "../models/ingredient.schema.ts";

type PopulatedAuthor = { _id: Types.ObjectId; name: string };

export type RecipeView = {
  id: string;
  title: string;
  slug: string;
  description: string;
  ingredients: Ingredient[];
  steps: string[];
  tags: string[];
  cuisine: string;
  difficulty: string;
  prepMinutes: number;
  cookMinutes: number;
  totalMinutes: number;
  servings: number;
  photo: string | null;
  ratingAvg: number;
  ratingCount: number;
  author: string | { id: string; name: string };
  createdAt: string;
  updatedAt: string;
};

function presentAuthor(author: Types.ObjectId | PopulatedAuthor): string | { id: string; name: string } {
  if (author && typeof author === "object" && "name" in author) {
    return { id: String(author._id), name: author.name };
  }
  return String(author);
}

export function presentRecipe(recipe: Recipe): RecipeView {
  return {
    id: String(recipe._id),
    title: recipe.title,
    slug: recipe.slug,
    description: recipe.description,
    ingredients: recipe.ingredients.map((item) => ({ name: item.name, quantity: item.quantity, unit: item.unit })),
    steps: [...recipe.steps],
    tags: [...recipe.tags],
    cuisine: recipe.cuisine,
    difficulty: recipe.difficulty,
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    totalMinutes: recipe.prepMinutes + recipe.cookMinutes,
    servings: recipe.servings,
    photo: recipe.photo,
    ratingAvg: recipe.ratingAvg,
    ratingCount: recipe.ratingCount,
    author: presentAuthor(recipe.author as Types.ObjectId | PopulatedAuthor),
    createdAt: recipe.createdAt.toISOString(),
    updatedAt: recipe.updatedAt.toISOString(),
  };
}
