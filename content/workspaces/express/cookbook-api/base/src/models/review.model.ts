// The Review model. One review per author per recipe (a unique compound index). After a review
// is written or deleted, a post hook recomputes the recipe's ratingAvg and ratingCount from
// scratch with an aggregation, so the denormalized numbers on the recipe always match the
// reviews. Recomputing from scratch is safe to run again, which matters because a post hook
// runs after the write has already happened.
import mongoose, { Schema, model, type HydratedDocument, type Model } from "mongoose";
import { now } from "../clock.ts";
import { toJsonPlugin } from "./plugins/to-json.ts";

export interface ReviewDoc {
  recipe: mongoose.Types.ObjectId;
  author: mongoose.Types.ObjectId | null;
  authorName: string;
  rating: number;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}

interface ReviewStatics {
  calcRatings(recipeId: mongoose.Types.ObjectId): Promise<void>;
}

export type ReviewModel = Model<ReviewDoc> & ReviewStatics;
export type Review = HydratedDocument<ReviewDoc>;

const reviewSchema = new Schema<ReviewDoc, ReviewModel>(
  {
    recipe: { type: Schema.Types.ObjectId, ref: "Recipe", required: true },
    // Nulled when the author deletes their account, so a review survives but is anonymized.
    author: { type: Schema.Types.ObjectId, ref: "User", default: null },
    authorName: { type: String, required: true, trim: true },
    rating: { type: Number, required: true, min: 1, max: 5, validate: [Number.isInteger, "rating must be a whole number"] },
    body: { type: String, default: "", trim: true, maxlength: 2000 },
  },
  { timestamps: { currentTime: () => now() } },
);

reviewSchema.index({ recipe: 1, author: 1 }, { unique: true, partialFilterExpression: { author: { $type: "objectId" } } });

reviewSchema.statics.calcRatings = async function calcRatings(this: ReviewModel, recipeId: mongoose.Types.ObjectId): Promise<void> {
  // $group accumulates the average and count; $round in a later $project rounds to two
  // decimals (you cannot round inside $group, since its fields must be accumulators).
  const [summary] = await this.aggregate<{ avg: number; count: number }>([
    { $match: { recipe: recipeId } },
    { $group: { _id: "$recipe", avg: { $avg: "$rating" }, count: { $sum: 1 } } },
    { $project: { _id: 0, avg: { $round: ["$avg", 2] }, count: 1 } },
  ]);
  await mongoose.model("Recipe").updateOne(
    { _id: recipeId },
    { ratingAvg: summary ? summary.avg : 0, ratingCount: summary ? summary.count : 0 },
  );
};

reviewSchema.post("save", async function afterSave(this: Review) {
  await ReviewModel.calcRatings(this.recipe);
});

reviewSchema.post("findOneAndDelete", async function afterDelete(doc: ReviewDoc | null) {
  if (doc) await ReviewModel.calcRatings(doc.recipe);
});

reviewSchema.plugin(toJsonPlugin);

export const ReviewModel = model<ReviewDoc, ReviewModel>("Review", reviewSchema);
