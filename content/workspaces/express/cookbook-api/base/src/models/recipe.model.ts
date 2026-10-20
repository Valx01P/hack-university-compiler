// The Recipe model: the heart of the cookbook. It embeds its ingredients and steps, references
// its author, reaches its reviews through a virtual populate, and keeps a denormalized
// ratingAvg and ratingCount that the review hooks maintain. The slug is derived in
// pre("validate") so the required slug is set before validation runs, and it is made unique by
// appending -2, -3, and so on. Soft delete and the shared JSON shape come from plugins.
import mongoose, { Schema, model, type HydratedDocument, type Model } from "mongoose";
import { now } from "../clock.ts";
import { ingredientSchema, type Ingredient } from "./ingredient.schema.ts";
import { softDeletePlugin, type SoftDeleteFields, type SoftDeleteMethods } from "./plugins/soft-delete.ts";
import { toJsonPlugin } from "./plugins/to-json.ts";

export const CUISINES = ["italian", "japanese", "mexican", "indian", "american", "french"] as const;
export const DIFFICULTIES = ["easy", "medium", "hard"] as const;

export interface RecipeDoc extends SoftDeleteFields {
  title: string;
  slug: string;
  description: string;
  ingredients: Ingredient[];
  steps: string[];
  tags: string[];
  cuisine: (typeof CUISINES)[number];
  difficulty: (typeof DIFFICULTIES)[number];
  prepMinutes: number;
  cookMinutes: number;
  servings: number;
  author: mongoose.Types.ObjectId;
  photo: string | null;
  ratingAvg: number;
  ratingCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface RecipeVirtuals {
  totalMinutes: number;
  reviews: mongoose.Types.ObjectId[];
}

export type RecipeModel = Model<RecipeDoc, Record<string, never>, SoftDeleteMethods, RecipeVirtuals>;
export type Recipe = HydratedDocument<RecipeDoc, SoftDeleteMethods & RecipeVirtuals>;

const recipeSchema = new Schema<RecipeDoc, RecipeModel, SoftDeleteMethods, Record<string, never>, RecipeVirtuals>(
  {
    title: { type: String, required: true, trim: true, minlength: 2, maxlength: 140 },
    slug: { type: String, required: true },
    description: { type: String, default: "", trim: true, maxlength: 2000 },
    ingredients: { type: [ingredientSchema], default: [] },
    steps: { type: [String], default: [] },
    tags: {
      type: [{ type: String, trim: true, lowercase: true }],
      validate: [(value: string[]) => value.length <= 10, "A recipe has at most 10 tags"],
      default: [],
    },
    cuisine: { type: String, required: true, enum: CUISINES },
    difficulty: { type: String, required: true, enum: DIFFICULTIES },
    prepMinutes: { type: Number, required: true, min: 1, max: 1440 },
    cookMinutes: { type: Number, default: 0, min: 0, max: 1440 },
    servings: { type: Number, default: 2, min: 1, max: 100 },
    author: { type: Schema.Types.ObjectId, ref: "User", required: true },
    photo: { type: String, default: null },
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
  },
  { timestamps: { currentTime: () => now() } },
);

// Total hands-on and cooking time, computed from the stored minutes and never stored itself.
recipeSchema.virtual("totalMinutes").get(function totalMinutes(this: RecipeDoc): number {
  return this.prepMinutes + this.cookMinutes;
});

// A recipe reaches its reviews backwards, without a reviews array on the document.
recipeSchema.virtual("reviews", {
  ref: "Review",
  localField: "_id",
  foreignField: "recipe",
});

recipeSchema.index({ title: "text", tags: "text", description: "text" }, { weights: { title: 10, tags: 5, description: 1 }, name: "recipe_text" });
recipeSchema.index({ cuisine: 1, ratingAvg: -1 });
recipeSchema.index({ author: 1, createdAt: -1 });
recipeSchema.index({ slug: 1 }, { unique: true });

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

recipeSchema.pre("validate", async function setSlug(this: Recipe) {
  if (!this.title) return;
  if (!this.isNew && !this.isModified("title")) return;
  const base = slugify(this.title);
  // Find slugs already taken by any recipe, deleted ones included, since the unique index
  // covers them too. The index remains the real guard against a rare race here. The $ne is
  // trusted() because sanitizeFilter is on globally and would otherwise neutralize this
  // code-written operator.
  const siblings = await RecipeModel.find({ slug: new RegExp(`^${base}(-\\d+)?$`), _id: mongoose.trusted({ $ne: this._id }) })
    .select("slug")
    .setOptions({ withDeleted: true })
    .lean();
  const taken = new Set(siblings.map((row) => row.slug));
  if (!taken.has(base)) {
    this.slug = base;
    return;
  }
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;
  this.slug = `${base}-${suffix}`;
});

recipeSchema.plugin(softDeletePlugin);
recipeSchema.plugin(toJsonPlugin);

export const RecipeModel = model<RecipeDoc, RecipeModel>("Recipe", recipeSchema);
