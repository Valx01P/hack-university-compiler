// Review rules. A user writes at most one review per recipe (the unique index enforces it, and
// a duplicate surfaces as 409), and never reviews their own recipe. Deleting goes through
// findOneAndDelete so the rating hook recomputes the recipe's average.
import type { Types } from "mongoose";
import { ForbiddenError, NotFoundError } from "../errors.ts";
import { RecipeModel } from "../models/recipe.model.ts";
import { ReviewModel, type Review } from "../models/review.model.ts";
import type { CreateReviewInput } from "../schemas/reviews.schemas.ts";

export async function addReview(slug: string, author: { id: Types.ObjectId; name: string }, input: CreateReviewInput): Promise<Review> {
  const recipe = await RecipeModel.findOne({ slug });
  if (!recipe) throw new NotFoundError(`No recipe with slug ${slug}`);
  if (String(recipe.author) === String(author.id)) throw new ForbiddenError("You cannot review your own recipe");
  return ReviewModel.create({
    recipe: recipe._id,
    author: author.id,
    authorName: author.name,
    rating: input.rating,
    body: input.body ?? "",
  });
}

export async function listReviews(slug: string): Promise<Review[]> {
  const recipe = await RecipeModel.findOne({ slug }).select("_id");
  if (!recipe) throw new NotFoundError(`No recipe with slug ${slug}`);
  return ReviewModel.find({ recipe: recipe._id }).populate("author", "name").sort({ createdAt: -1 });
}

export async function deleteReview(reviewId: string, userId: Types.ObjectId): Promise<void> {
  const review = await ReviewModel.findById(reviewId);
  if (!review) throw new NotFoundError("No such review");
  if (String(review.author) !== String(userId)) throw new ForbiddenError("Only the reviewer can delete this review");
  // findOneAndDelete (not deleteOne) so post("findOneAndDelete") recomputes the recipe's rating.
  await ReviewModel.findOneAndDelete({ _id: review._id });
}
