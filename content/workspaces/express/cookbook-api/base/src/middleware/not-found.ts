// Any request that matched no route lands here and becomes a 404 problem, handed to the error
// handler so unknown routes answer the same shape as everything else.
import type { RequestHandler } from "express";
import { NotFoundError } from "../errors.ts";

export const notFound: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`No route for ${req.method} ${req.path}`));
};
