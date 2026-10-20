// Read-only aggregation endpoints over the recipes.
import { Router } from "express";
import * as stats from "../controllers/stats.controller.ts";

export const statsRouter: Router = Router();

statsRouter.get("/cuisines", stats.cuisines);
statsRouter.get("/tags", stats.tags);
