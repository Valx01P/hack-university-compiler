// The public HTML pages: upcoming events at /, and one event at /e/:slug.
import { Router } from "express";
import type { PagesController } from "./pages.controller.ts";

export function pagesRoutes({ controller }: { controller: PagesController }): Router {
  const router = Router();
  router.get("/", controller.home);
  router.get("/e/:slug", controller.event);
  return router;
}
