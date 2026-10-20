// Deleting an account touches four collections, so it runs in one MongoDB transaction (which
// needs the replica set): the user's recipes are soft-deleted, their reviews anonymized, their
// recipes pulled from every collection, and the user removed. Either all of it commits or none
// of it does, and every operation carries the same session.
import mongoose, { type Types } from "mongoose";
import { now } from "../clock.ts";
import { CollectionModel } from "../models/collection.model.ts";
import { RecipeModel } from "../models/recipe.model.ts";
import { ReviewModel } from "../models/review.model.ts";
import { UserModel } from "../models/user.model.ts";

export async function deleteAccount(userId: Types.ObjectId): Promise<void> {
  await mongoose.connection.transaction(async (session) => {
    const recipes = await RecipeModel.find({ author: userId }).select("_id").session(session);
    const recipeIds = recipes.map((recipe) => recipe._id);

    await RecipeModel.updateMany({ author: userId }, { deletedAt: now() }, { session });
    await ReviewModel.updateMany({ author: userId }, { author: null, authorName: "deleted user" }, { session });
    if (recipeIds.length > 0) {
      await CollectionModel.updateMany({ recipes: mongoose.trusted({ $in: recipeIds }) }, { $pull: { recipes: { $in: recipeIds } } }, { session });
    }
    await UserModel.deleteOne({ _id: userId }, { session });
  });
}
