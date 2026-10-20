// Recipe and recipe-review routes. Reads are open; writes need a signed-in user. Each route
// names the schema that guards it, so a controller only ever sees validated input.
import { Router } from "express";
import * as recipes from "../controllers/recipes.controller.ts";
import * as reviews from "../controllers/reviews.controller.ts";
import { requireUser } from "../middleware/require-user.ts";
import { validate } from "../middleware/validate.ts";
import { CreateRecipeBody, ListRecipesQuery, SearchRecipesBody, SlugParam, UpdateRecipeBody } from "../schemas/recipes.schemas.ts";
import { CreateReviewBody } from "../schemas/reviews.schemas.ts";

export const recipesRouter: Router = Router();

recipesRouter.get("/", validate({ query: ListRecipesQuery }), recipes.list);
recipesRouter.post("/search", validate({ body: SearchRecipesBody }), recipes.search);
recipesRouter.post("/", requireUser, validate({ body: CreateRecipeBody }), recipes.create);
recipesRouter.get("/:slug", validate({ params: SlugParam }), recipes.getBySlug);
recipesRouter.patch("/:slug", requireUser, validate({ params: SlugParam, body: UpdateRecipeBody }), recipes.patch);
recipesRouter.delete("/:slug", requireUser, validate({ params: SlugParam }), recipes.remove);
recipesRouter.get("/:slug/reviews", validate({ params: SlugParam }), reviews.listForRecipe);
recipesRouter.post("/:slug/reviews", requireUser, validate({ params: SlugParam, body: CreateReviewBody }), reviews.create);
