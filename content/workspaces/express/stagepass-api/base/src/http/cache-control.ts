// Cache-Control per route. Public lists may be kept by browsers and shared caches for a while,
// and private data (your orders, your profile) never.
import type { RequestHandler } from "express";

export function cacheControl(value: string): RequestHandler {
  return (_req, res, next) => {
    res.set("Cache-Control", value);
    next();
  };
}

export const noStore = cacheControl("no-store");
