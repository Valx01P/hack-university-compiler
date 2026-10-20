// Rebuilds the cookbook's data from scratch, deterministically: fixed ObjectIds, a password
// hash computed once, explicit timestamps, and ratings chosen so every recipe's ratingAvg is
// exact. It inserts with insertMany so the model hooks do not run (slugs, the hash, and the
// rating fields are all set here on purpose), which keeps the seed reproducible.
import argon2 from "argon2";
import mongoose from "mongoose";
import { connect, disconnect } from "../src/db/mongoose.ts";
import { loadConfig } from "../src/config.ts";
import { CollectionModel } from "../src/models/collection.model.ts";
import { CUISINES } from "../src/models/recipe.model.ts";
import { RecipeModel } from "../src/models/recipe.model.ts";
import { ReviewModel } from "../src/models/review.model.ts";
import { UserModel } from "../src/models/user.model.ts";
import { createHash } from "node:crypto";

const PASSWORD = "cook-with-node-26";
export const JULIA_RESET_TOKEN = "julia-reset-token-2026";
const EPOCH = new Date("2026-09-01T10:00:00.000Z").getTime();

function oid(suffix: string): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(`66f10000${suffix.padStart(16, "0")}`);
}
function at(hoursAfterEpoch: number): Date {
  return new Date(EPOCH + hoursAfterEpoch * 3_600_000);
}
function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const USERS = [
  { suffix: "0001", name: "Julia Moreno", email: "julia@cookbook.test", role: "admin" as const },
  { suffix: "0002", name: "Marco Rossi", email: "marco@cookbook.test", role: "member" as const },
  { suffix: "0003", name: "Aiko Tanaka", email: "aiko@cookbook.test", role: "member" as const },
  { suffix: "0004", name: "Sam Patel", email: "sam@cookbook.test", role: "member" as const },
];

// Three recipes per cuisine. authorIndex maps each cuisine's recipes to a user (Sam, index 3,
// writes none, so he is the pure reviewer the fixtures need).
const RECIPES: { title: string; cuisine: (typeof CUISINES)[number]; difficulty: "easy" | "medium" | "hard"; prep: number; cook: number; tags: string[]; authorIndex: number }[] = [
  { title: "Cacio e Pepe", cuisine: "italian", difficulty: "easy", prep: 20, cook: 10, tags: ["pasta", "quick"], authorIndex: 0 },
  { title: "Margherita Pizza", cuisine: "italian", difficulty: "medium", prep: 90, cook: 12, tags: ["pizza", "vegetarian"], authorIndex: 0 },
  { title: "Mushroom Risotto", cuisine: "italian", difficulty: "medium", prep: 45, cook: 30, tags: ["rice", "vegetarian"], authorIndex: 0 },
  { title: "Miso Soup", cuisine: "japanese", difficulty: "easy", prep: 15, cook: 10, tags: ["soup", "quick"], authorIndex: 1 },
  { title: "Chicken Katsu", cuisine: "japanese", difficulty: "medium", prep: 40, cook: 20, tags: ["chicken", "fried"], authorIndex: 1 },
  { title: "Tonkotsu Ramen", cuisine: "japanese", difficulty: "hard", prep: 720, cook: 180, tags: ["soup", "pork"], authorIndex: 1 },
  { title: "Guacamole", cuisine: "mexican", difficulty: "easy", prep: 10, cook: 0, tags: ["dip", "quick", "vegetarian"], authorIndex: 2 },
  { title: "Chicken Tinga Tacos", cuisine: "mexican", difficulty: "easy", prep: 35, cook: 25, tags: ["chicken", "tacos"], authorIndex: 2 },
  { title: "Mole Poblano", cuisine: "mexican", difficulty: "hard", prep: 240, cook: 120, tags: ["chicken", "sauce"], authorIndex: 2 },
  { title: "Chana Masala", cuisine: "indian", difficulty: "easy", prep: 40, cook: 30, tags: ["curry", "vegetarian"], authorIndex: 2 },
  { title: "Butter Chicken", cuisine: "indian", difficulty: "medium", prep: 60, cook: 40, tags: ["chicken", "curry"], authorIndex: 2 },
  { title: "Masala Dosa", cuisine: "indian", difficulty: "hard", prep: 960, cook: 20, tags: ["breakfast", "vegetarian"], authorIndex: 2 },
  { title: "Buttermilk Pancakes", cuisine: "american", difficulty: "easy", prep: 20, cook: 15, tags: ["breakfast", "quick"], authorIndex: 1 },
  { title: "Smash Burgers", cuisine: "american", difficulty: "easy", prep: 25, cook: 10, tags: ["beef", "quick"], authorIndex: 1 },
  { title: "Texas Brisket", cuisine: "american", difficulty: "hard", prep: 720, cook: 600, tags: ["beef", "bbq"], authorIndex: 1 },
  { title: "French Omelette", cuisine: "french", difficulty: "medium", prep: 10, cook: 5, tags: ["breakfast", "eggs", "quick"], authorIndex: 0 },
  { title: "Ratatouille", cuisine: "french", difficulty: "medium", prep: 75, cook: 60, tags: ["vegetarian", "stew"], authorIndex: 0 },
  { title: "Beef Bourguignon", cuisine: "french", difficulty: "hard", prep: 210, cook: 180, tags: ["beef", "stew"], authorIndex: 0 },
];

const SOFT_DELETED = [
  { title: "Burnt Toast", cuisine: "american" as const, difficulty: "easy" as const, prep: 5, cook: 3, tags: ["breakfast"], authorIndex: 1 },
  { title: "Instant Noodles Deluxe", cuisine: "japanese" as const, difficulty: "easy" as const, prep: 5, cook: 3, tags: ["quick"], authorIndex: 1 },
];

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  await connect(config.MONGODB_URI);
  await mongoose.connection.dropDatabase();

  const passwordHash = await argon2.hash(PASSWORD);
  const users = USERS.map((user, index) => ({
    _id: oid(user.suffix),
    email: user.email,
    name: user.name,
    password: passwordHash,
    role: user.role,
    resetTokenHash: user.suffix === "0001" ? createHash("sha256").update(JULIA_RESET_TOKEN).digest("hex") : null,
    resetTokenExpires: user.suffix === "0001" ? at(24 * 40) : null,
    createdAt: at(index),
    updatedAt: at(index),
  }));
  await UserModel.insertMany(users, { timestamps: false });

  // Ten recipes get three reviews (ratings 5, 4, 3 -> avg 4.00), five get two (5, 4 -> avg 4.50),
  // the last three none. A recipe's reviews come from the three users who did not write it.
  const reviewCounts = [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 0, 0, 0];
  const ratingsByCount: Record<number, number[]> = { 3: [5, 4, 3], 2: [5, 4], 0: [] };

  const recipeDocs: Record<string, unknown>[] = [];
  const reviewDocs: Record<string, unknown>[] = [];
  let reviewCounter = 1;

  RECIPES.forEach((recipe, index) => {
    const id = oid(`01${(index + 1).toString().padStart(2, "0")}`);
    const count = reviewCounts[index] ?? 0;
    const ratings = ratingsByCount[count] ?? [];
    const sum = ratings.reduce((total, value) => total + value, 0);
    const ratingAvg = count > 0 ? Math.round((sum / count) * 100) / 100 : 0;

    recipeDocs.push({
      _id: id,
      title: recipe.title,
      slug: slugify(recipe.title),
      description: `A reliable ${recipe.cuisine} recipe: ${recipe.title}.`,
      ingredients: [
        { name: "salt", quantity: 1, unit: "tsp" },
        { name: "olive oil", quantity: 2, unit: "tbsp" },
      ],
      steps: ["Prepare the ingredients.", "Cook until done.", "Serve."],
      tags: recipe.tags,
      cuisine: recipe.cuisine,
      difficulty: recipe.difficulty,
      prepMinutes: recipe.prep,
      cookMinutes: recipe.cook,
      servings: 4,
      author: oid(USERS[recipe.authorIndex]!.suffix),
      photo: null,
      ratingAvg,
      ratingCount: count,
      deletedAt: null,
      createdAt: at(100 + index),
      updatedAt: at(100 + index),
    });

    // Reviewers are the users who are not this recipe's author, in id order.
    const reviewers = USERS.filter((_, userIndex) => userIndex !== recipe.authorIndex).slice(0, count);
    reviewers.forEach((reviewer, position) => {
      reviewDocs.push({
        _id: oid(`02${(reviewCounter++).toString().padStart(2, "0")}`),
        recipe: id,
        author: oid(reviewer.suffix),
        authorName: reviewer.name,
        rating: ratings[position],
        body: `${reviewer.name.split(" ")[0]} enjoyed this one.`,
        createdAt: at(200 + index),
        updatedAt: at(200 + index),
      });
    });
  });

  SOFT_DELETED.forEach((recipe, index) => {
    recipeDocs.push({
      _id: oid(`01${(19 + index).toString().padStart(2, "0")}`),
      title: recipe.title,
      slug: slugify(recipe.title),
      description: `An old ${recipe.cuisine} recipe that was removed.`,
      ingredients: [{ name: "bread", quantity: 2, unit: "piece" }],
      steps: ["Do the thing."],
      tags: recipe.tags,
      cuisine: recipe.cuisine,
      difficulty: recipe.difficulty,
      prepMinutes: recipe.prep,
      cookMinutes: recipe.cook,
      servings: 1,
      author: oid(USERS[recipe.authorIndex]!.suffix),
      photo: null,
      ratingAvg: 0,
      ratingCount: 0,
      deletedAt: at(300 + index),
      createdAt: at(118 + index),
      updatedAt: at(300 + index),
    });
  });

  await RecipeModel.insertMany(recipeDocs, { timestamps: false });
  await ReviewModel.insertMany(reviewDocs, { timestamps: false });

  const recipeId = (oneBased: number): mongoose.Types.ObjectId => oid(`01${oneBased.toString().padStart(2, "0")}`);
  await CollectionModel.insertMany(
    [
      { _id: oid("0301"), owner: oid("0004"), name: "Weeknight", recipes: [recipeId(1), recipeId(4), recipeId(7), recipeId(13)], createdAt: at(400), updatedAt: at(400) },
      { _id: oid("0302"), owner: oid("0002"), name: "Project Cooking", recipes: [recipeId(6), recipeId(9), recipeId(18)], createdAt: at(401), updatedAt: at(401) },
      { _id: oid("0303"), owner: oid("0003"), name: "Breakfast", recipes: [recipeId(13), recipeId(16)], createdAt: at(402), updatedAt: at(402) },
    ],
    { timestamps: false },
  );

  const counts = {
    users: await UserModel.countDocuments({}).setOptions({ withDeleted: true }),
    recipes: await RecipeModel.countDocuments({}).setOptions({ withDeleted: true }),
    reviews: await ReviewModel.estimatedDocumentCount(),
    collections: await CollectionModel.estimatedDocumentCount(),
  };
  process.stdout.write(`Seeded ${counts.users} users, ${counts.recipes} recipes (2 soft-deleted), ${counts.reviews} reviews, ${counts.collections} collections\n`);
  await disconnect();
}

await main();
