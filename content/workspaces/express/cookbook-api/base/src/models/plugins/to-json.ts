// A plugin that gives every model the same JSON shape clients expect: an id string instead of
// _id, no __v, and virtuals included. It also strips fields that must never reach a client,
// so a user document serialized anywhere drops its password hash and reset fields even when a
// query selected them. Applied to each schema so views never have to reshape documents by hand.
import type { Schema } from "mongoose";

// Field names that are always removed from JSON, whichever model they appear on. Models without
// these fields are unaffected.
const NEVER_SERIALIZE = ["password", "resetTokenHash", "resetTokenExpires"];

export function toJsonPlugin(schema: Schema): void {
  schema.set("toJSON", {
    virtuals: true,
    versionKey: false,
    transform(_doc, ret: Record<string, unknown>) {
      if (ret._id != null) {
        ret.id = String(ret._id);
        delete ret._id;
      }
      delete ret.__v;
      for (const field of NEVER_SERIALIZE) delete ret[field];
      return ret;
    },
  });
}
