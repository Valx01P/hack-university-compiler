// The stats controller: two aggregation endpoints over recipes. Both go through aggregate, so
// the soft-delete aggregate hook keeps deleted recipes out of the numbers. The average is taken
// in $group and rounded in a later $project, since $group fields must be accumulators.
import type { RequestHandler } from "express";
import { RecipeModel } from "../models/recipe.model.ts";

export const cuisines: RequestHandler = async (_req, res) => {
  const rows = await RecipeModel.aggregate<{ _id: string; count: number; avgRating: number }>([
    { $group: { _id: "$cuisine", count: { $sum: 1 }, avgRating: { $avg: "$ratingAvg" } } },
    { $project: { count: 1, avgRating: { $round: ["$avgRating", 2] } } },
    { $sort: { _id: 1 } },
  ]);
  res.json({ items: rows.map((row) => ({ cuisine: row._id, count: row.count, avgRating: row.avgRating })) });
};

export const tags: RequestHandler = async (_req, res) => {
  const rows = await RecipeModel.aggregate<{ _id: string; count: number; avgPrepMinutes: number }>([
    { $unwind: "$tags" },
    { $group: { _id: "$tags", count: { $sum: 1 }, avgPrepMinutes: { $avg: "$prepMinutes" } } },
    { $project: { count: 1, avgPrepMinutes: { $round: ["$avgPrepMinutes", 0] } } },
    { $sort: { count: -1, _id: 1 } },
    { $limit: 10 },
  ]);
  res.json({ items: rows.map((row) => ({ tag: row._id, count: row.count, avgPrepMinutes: row.avgPrepMinutes })) });
};
