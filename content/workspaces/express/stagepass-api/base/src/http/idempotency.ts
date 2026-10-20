// The Idempotency-Key header on POST /v1/orders. A client makes one key per purchase and sends
// it again on every retry, so a timeout followed by a retry cannot buy the tickets twice: the
// checkout service finds the order the key already made and returns it.
import type { RequestHandler } from "express";
import { z } from "zod";
import { ValidationError } from "./errors.ts";

export const IdempotencyKey = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,64}$/, "Use 8 to 64 letters, digits, - or _ (a UUID works)");

/** Requires the header and stores it in res.locals.idempotencyKey. */
export const requireIdempotencyKey: RequestHandler = (req, res, next) => {
  const raw = req.get("idempotency-key");
  if (raw === undefined) {
    throw new ValidationError(
      [{ field: "Idempotency-Key", message: "Required: send a new key with each purchase, and the same key on retries" }],
      "The Idempotency-Key header is missing",
    );
  }
  const result = IdempotencyKey.safeParse(raw);
  if (!result.success) {
    throw new ValidationError([{ field: "Idempotency-Key", message: result.error.issues[0]?.message ?? "Invalid" }]);
  }
  res.locals.idempotencyKey = result.data;
  next();
};
