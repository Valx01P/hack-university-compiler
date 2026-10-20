// The collections controller. Collections are simple enough to talk to the model directly (the
// classic MVC "controller to model" path). getById populates the collection's recipes in one
// extra query instead of looking each one up in a loop, and soft-deleted recipes drop out of
// the populate automatically through the query hook.
import type { RequestHandler } from "express";
import type { Types } from "mongoose";
import { ForbiddenError, NotFoundError } from "../errors.ts";
import { CollectionModel, type RecipeCollection } from "../models/collection.model.ts";
import { RecipeModel } from "../models/recipe.model.ts";
import type { User } from "../models/user.model.ts";

type RecipeSummary = { id: string; title: string; slug: string; cuisine: string; ratingAvg: number; author: string | { id: string; name: string } };

function presentCollection(collection: RecipeCollection, populated: boolean): Record<string, unknown> {
  return {
    id: String(collection._id),
    name: collection.name,
    owner: String(collection.owner),
    recipeCount: collection.recipes.length,
    recipes: populated ? collection.recipes.map(presentRecipeSummary) : collection.recipes.map(String),
    createdAt: collection.createdAt.toISOString(),
  };
}

function presentRecipeSummary(recipe: unknown): RecipeSummary {
  const row = recipe as { _id: Types.ObjectId; title: string; slug: string; cuisine: string; ratingAvg: number; author: Types.ObjectId | { _id: Types.ObjectId; name: string } };
  const author = row.author && typeof row.author === "object" && "name" in row.author ? { id: String(row.author._id), name: row.author.name } : String(row.author);
  return { id: String(row._id), title: row.title, slug: row.slug, cuisine: row.cuisine, ratingAvg: row.ratingAvg, author };
}

export const list: RequestHandler = async (_req, res) => {
  const user = res.locals.user as User;
  const collections = await CollectionModel.find({ owner: user._id }).sort({ name: 1 });
  res.json({ items: collections.map((collection) => presentCollection(collection, false)) });
};

export const create: RequestHandler = async (req, res) => {
  const user = res.locals.user as User;
  const collection = await CollectionModel.create({ owner: user._id, name: (req.body as { name: string }).name, recipes: [] });
  res.status(201).json(presentCollection(collection, false));
};

export const getById: RequestHandler = async (req, res) => {
  const user = res.locals.user as User;
  const collection = await CollectionModel.findOne({ _id: String(req.params.id), owner: user._id }).populate({
    path: "recipes",
    select: "title slug cuisine ratingAvg author",
    populate: { path: "author", select: "name" },
  });
  if (!collection) throw new NotFoundError("No such collection");
  res.json(presentCollection(collection, true));
};

export const addRecipe: RequestHandler = async (req, res) => {
  const user = res.locals.user as User;
  const recipe = await RecipeModel.findOne({ slug: String(req.params.slug) }).select("_id");
  if (!recipe) throw new NotFoundError(`No recipe with slug ${String(req.params.slug)}`);
  const collection = await CollectionModel.findById(String(req.params.id));
  if (!collection) throw new NotFoundError("No such collection");
  if (String(collection.owner) !== String(user._id)) throw new ForbiddenError("Only the owner can change this collection");
  await CollectionModel.updateOne({ _id: collection._id }, { $addToSet: { recipes: recipe._id } });
  const updated = await CollectionModel.findById(collection._id);
  res.json(presentCollection(updated as RecipeCollection, false));
};
