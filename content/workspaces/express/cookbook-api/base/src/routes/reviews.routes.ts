// Deleting a review by its own id (listing and creating live under a recipe's routes).
import { Router } from "express";
import * as reviews from "../controllers/reviews.controller.ts";
import { requireUser } from "../middleware/require-user.ts";
import { validate } from "../middleware/validate.ts";
import { ReviewIdParam } from "../schemas/reviews.schemas.ts";

export const reviewsRouter: Router = Router();

reviewsRouter.delete("/:id", requireUser, validate({ params: ReviewIdParam }), reviews.remove);
