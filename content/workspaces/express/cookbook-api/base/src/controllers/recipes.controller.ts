// The recipe controller: reads validated input, calls the recipe service, and renders the
// result through the recipe view. Business rules (who may edit, how a filter is built) live in
// the service, so these handlers stay about HTTP: status codes, the Location header, 204 on
// delete.
import type { RequestHandler } from "express";
import type { User } from "../models/user.model.ts";
import type { ListRecipesInput, SearchRecipesInput } from "../schemas/recipes.schemas.ts";
import { createRecipe, deleteRecipe, getRecipeBySlug, listRecipes, searchRecipes, updateRecipe } from "../services/recipes.service.ts";
import { presentRecipe } from "../views/recipe.view.ts";

export const list: RequestHandler = async (_req, res) => {
  const query = res.locals.query as ListRecipesInput;
  const { data, total } = await listRecipes(query);
  res.json({ items: data.map(presentRecipe), total, page: query.page, limit: query.limit });
};

export const search: RequestHandler = async (req, res) => {
  const recipes = await searchRecipes(req.body as SearchRecipesInput);
  res.json({ items: recipes.map(presentRecipe) });
};

export const getBySlug: RequestHandler = async (req, res) => {
  const recipe = await getRecipeBySlug(String(req.params.slug));
  res.json(presentRecipe(recipe));
};

export const create: RequestHandler = async (req, res) => {
  const user = res.locals.user as User;
  const recipe = await createRecipe(user._id, req.body);
  // Populate the author so create and read answer the same shape (author as { id, name }).
  await recipe.populate("author", "name");
  res.status(201).location(`/api/recipes/${recipe.slug}`).json(presentRecipe(recipe));
};

export const patch: RequestHandler = async (req, res) => {
  const user = res.locals.user as User;
  const recipe = await updateRecipe(String(req.params.slug), user._id, req.body);
  await recipe.populate("author", "name");
  res.json(presentRecipe(recipe));
};

export const remove: RequestHandler = async (req, res) => {
  const user = res.locals.user as User;
  await deleteRecipe(String(req.params.slug), user._id);
  res.status(204).end();
};
