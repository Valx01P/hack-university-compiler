// Gives every request an id: the incoming X-Request-Id if the client sent one, otherwise a new
// UUID. It is echoed back in the response header and attached to the request so logs can carry
// it. A stable id keeps log lines and transcripts matchable.
import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.get("x-request-id");
  req.requestId = incoming && incoming.length <= 200 ? incoming : randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  next();
};
