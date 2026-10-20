// Collection routes: a user's own named lists of recipes. Every route needs a signed-in user,
// and ownership is checked in the controller.
import { Router } from "express";
import * as collections from "../controllers/collections.controller.ts";
import { requireUser } from "../middleware/require-user.ts";
import { validate } from "../middleware/validate.ts";
import { CollectionIdParam, CollectionRecipeParams, CreateCollectionBody } from "../schemas/collections.schemas.ts";

export const collectionsRouter: Router = Router();

collectionsRouter.get("/", requireUser, collections.list);
collectionsRouter.post("/", requireUser, validate({ body: CreateCollectionBody }), collections.create);
collectionsRouter.get("/:id", requireUser, validate({ params: CollectionIdParam }), collections.getById);
collectionsRouter.put("/:id/recipes/:slug", requireUser, validate({ params: CollectionRecipeParams }), collections.addRecipe);
