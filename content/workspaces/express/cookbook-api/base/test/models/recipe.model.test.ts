import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { RecipeModel } from "../../src/models/recipe.model.ts";
import { clearDb, connectTestDb, dropTestDb } from "../support/mongo.ts";

const author = new mongoose.Types.ObjectId();

function recipe(title: string) {
  return {
    title,
    description: "x",
    ingredients: [{ name: "salt", quantity: 1, unit: "tsp" as const }],
    steps: ["Cook."],
    cuisine: "italian" as const,
    difficulty: "easy" as const,
    prepMinutes: 20,
    author,
  };
}

beforeAll(() => connectTestDb("recipe_model"));
afterAll(() => dropTestDb());
beforeEach(() => clearDb());

describe("Recipe slug hook", () => {
  it("derives the slug from the title", async () => {
    const created = await RecipeModel.create(recipe("Cacio e Pepe"));
    expect(created.slug).toBe("cacio-e-pepe");
  });

  it("makes duplicate titles unique with -2, -3", async () => {
    const a = await RecipeModel.create(recipe("Weeknight Pasta"));
    const b = await RecipeModel.create(recipe("Weeknight Pasta"));
    const c = await RecipeModel.create(recipe("Weeknight Pasta"));
    expect([a.slug, b.slug, c.slug]).toEqual(["weeknight-pasta", "weeknight-pasta-2", "weeknight-pasta-3"]);
  });

  it("updates the slug when the title changes but not for other edits", async () => {
    const created = await RecipeModel.create(recipe("First Title"));
    created.title = "Second Title";
    await created.save();
    expect(created.slug).toBe("second-title");

    created.description = "a new description";
    await created.save();
    expect(created.slug).toBe("second-title");
  });

  it("computes totalMinutes from prep and cook times", async () => {
    const created = await RecipeModel.create({ ...recipe("Timed"), prepMinutes: 20, cookMinutes: 10 });
    expect(created.totalMinutes).toBe(30);
  });
});

describe("Recipe validation", () => {
  it("rejects an unknown cuisine with a ValidationError", async () => {
    await expect(RecipeModel.create({ ...recipe("Bad"), cuisine: "klingon" as never })).rejects.toBeInstanceOf(mongoose.Error.ValidationError);
  });

  it("rejects more than ten tags", async () => {
    const tags = Array.from({ length: 11 }, (_v, index) => `tag${index}`);
    await expect(RecipeModel.create({ ...recipe("Tagged"), tags })).rejects.toBeInstanceOf(mongoose.Error.ValidationError);
  });
});
