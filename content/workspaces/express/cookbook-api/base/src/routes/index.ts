// Mounts every feature's routes under /api, plus the two /me routes that act on the signed-in
// user. app.ts mounts this router at /api and the health router at the root.
import { Router } from "express";
import * as auth from "../controllers/auth.controller.ts";
import { requireUser } from "../middleware/require-user.ts";
import { validate } from "../middleware/validate.ts";
import { UpdateMeBody } from "../schemas/auth.schemas.ts";
import { authRouter } from "./auth.routes.ts";
import { collectionsRouter } from "./collections.routes.ts";
import { recipesRouter } from "./recipes.routes.ts";
import { reviewsRouter } from "./reviews.routes.ts";
import { statsRouter } from "./stats.routes.ts";

export function apiRouter(): Router {
  const router = Router();
  router.use("/auth", authRouter);
  router.patch("/me", requireUser, validate({ body: UpdateMeBody }), auth.updateMe);
  router.delete("/me", requireUser, auth.deleteMe);
  router.use("/recipes", recipesRouter);
  router.use("/reviews", reviewsRouter);
  router.use("/collections", collectionsRouter);
  router.use("/stats", statsRouter);
  return router;
}
