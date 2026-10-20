import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { RecipeModel } from "../../src/models/recipe.model.ts";
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

beforeAll(() => connectTestDb("soft_delete"));
afterAll(() => dropTestDb());
beforeEach(() => clearDb());

describe("Soft delete plugin", () => {
  it("hides deleted recipes from find, countDocuments, and aggregate, but shows them with withDeleted", async () => {
    const keep = await makeRecipe("Keep");
    const drop = await makeRecipe("Drop");
    const deleted = (await RecipeModel.findById(drop))!;
    await deleted.softDelete();

    expect((await RecipeModel.find({})).map((row) => String(row._id))).toEqual([String(keep)]);
    expect(await RecipeModel.countDocuments({})).toBe(1);

    const grouped = await RecipeModel.aggregate<{ total: number }>([{ $group: { _id: null, total: { $sum: 1 } } }]);
    expect(grouped[0]?.total).toBe(1);

    const all = await RecipeModel.find({}).setOptions({ withDeleted: true });
    expect(all).toHaveLength(2);
  });

  it("keeps edits through findOneAndUpdate from touching deleted recipes", async () => {
    const id = await makeRecipe("Editable");
    await (await RecipeModel.findById(id))!.softDelete();

    const updated = await RecipeModel.findOneAndUpdate({ _id: id }, { description: "changed" }, { returnDocument: "after" });
    expect(updated).toBeNull();
  });
});
