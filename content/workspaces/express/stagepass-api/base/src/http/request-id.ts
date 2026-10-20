// Gives every request an id, first in the chain so every later line can use it: logs, problem
// bodies, and the X-Request-Id response header. A sensible id from the client is kept, so one
// id can follow a request across services.
import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

const ACCEPTED = /^[A-Za-z0-9._:-]{1,64}$/;

export function requestId(): RequestHandler {
  return (req, res, next) => {
    const sent = req.get("x-request-id");
    req.requestId = sent !== undefined && ACCEPTED.test(sent) ? sent : randomUUID();
    res.set("X-Request-Id", req.requestId);
    next();
  };
}
