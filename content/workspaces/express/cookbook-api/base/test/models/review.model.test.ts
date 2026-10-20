import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { RecipeModel } from "../../src/models/recipe.model.ts";
import { ReviewModel } from "../../src/models/review.model.ts";
import { clearDb, connectTestDb, dropTestDb } from "../support/mongo.ts";

const author = new mongoose.Types.ObjectId();

async function makeRecipe(title: string): Promise<mongoose.Types.ObjectId> {
  const created = await RecipeModel.create({
    title,
    ingredients: [{ name: "salt", quantity: 1, unit: "tsp" as const }],
    steps: ["Cook."],
    cuisine: "italian" as const,
    difficulty: "easy" as const,
    prepMinutes: 20,
    author,
  });
  return created._id;
}

beforeAll(() => connectTestDb("review_model"));
afterAll(() => dropTestDb());
beforeEach(() => clearDb());

describe("Review rating hooks", () => {
  it("keeps the recipe's ratingAvg and ratingCount in sync after save and delete", async () => {
    const recipeId = await makeRecipe("Rated");
    await ReviewModel.create({ recipe: recipeId, author: new mongoose.Types.ObjectId(), authorName: "A", rating: 4 });
    await ReviewModel.create({ recipe: recipeId, author: new mongoose.Types.ObjectId(), authorName: "B", rating: 5 });

    let recipe = (await RecipeModel.findById(recipeId))!;
    expect(recipe.ratingCount).toBe(2);
    expect(recipe.ratingAvg).toBe(4.5);

    const last = await ReviewModel.findOne({ recipe: recipeId, rating: 5 });
    await ReviewModel.findOneAndDelete({ _id: last!._id });

    recipe = (await RecipeModel.findById(recipeId))!;
    expect(recipe.ratingCount).toBe(1);
    expect(recipe.ratingAvg).toBe(4);
  });

  it("resets to zero when the last review is deleted", async () => {
    const recipeId = await makeRecipe("Once Rated");
    const review = await ReviewModel.create({ recipe: recipeId, author: new mongoose.Types.ObjectId(), authorName: "A", rating: 3 });
    await ReviewModel.findOneAndDelete({ _id: review._id });

    const recipe = (await RecipeModel.findById(recipeId))!;
    expect(recipe.ratingCount).toBe(0);
    expect(recipe.ratingAvg).toBe(0);
  });

  it("rejects a second review by the same author for the same recipe", async () => {
    const recipeId = await makeRecipe("Double");
    const reviewer = new mongoose.Types.ObjectId();
    await ReviewModel.create({ recipe: recipeId, author: reviewer, authorName: "A", rating: 4 });
    await expect(ReviewModel.create({ recipe: recipeId, author: reviewer, authorName: "A", rating: 5 })).rejects.toMatchObject({ code: 11000 });
  });
});
