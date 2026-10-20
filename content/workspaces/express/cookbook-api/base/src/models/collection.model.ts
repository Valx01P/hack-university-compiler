// A Collection is a user's named list of recipes (like "Weeknight dinners"). The recipes field
// holds references, and a user cannot have two collections with the same name (a unique
// compound index).
import mongoose, { Schema, model, type HydratedDocument, type Model } from "mongoose";
import { now } from "../clock.ts";
import { toJsonPlugin } from "./plugins/to-json.ts";

export interface CollectionDoc {
  owner: mongoose.Types.ObjectId;
  name: string;
  recipes: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

export type CollectionModel = Model<CollectionDoc>;
export type RecipeCollection = HydratedDocument<CollectionDoc>;

const collectionSchema = new Schema<CollectionDoc, CollectionModel>(
  {
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
    recipes: { type: [{ type: Schema.Types.ObjectId, ref: "Recipe" }], default: [] },
  },
  { timestamps: { currentTime: () => now() } },
);

collectionSchema.index({ owner: 1, name: 1 }, { unique: true });

collectionSchema.plugin(toJsonPlugin);

export const CollectionModel = model<CollectionDoc, CollectionModel>("Collection", collectionSchema);
