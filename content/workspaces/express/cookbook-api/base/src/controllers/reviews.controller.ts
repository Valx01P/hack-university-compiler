// The review controller: list a recipe's reviews, add one, and delete one. The service enforces
// one review per recipe and the "not your own recipe" rule.
import type { RequestHandler } from "express";
import type { User } from "../models/user.model.ts";
import { addReview, deleteReview, listReviews } from "../services/reviews.service.ts";
import { presentReview } from "../views/review.view.ts";

export const listForRecipe: RequestHandler = async (req, res) => {
  const reviews = await listReviews(String(req.params.slug));
  res.json({ items: reviews.map(presentReview) });
};

export const create: RequestHandler = async (req, res) => {
  const user = res.locals.user as User;
  const review = await addReview(String(req.params.slug), { id: user._id, name: user.name }, req.body);
  res.status(201).json(presentReview(review));
};

export const remove: RequestHandler = async (req, res) => {
  const user = res.locals.user as User;
  await deleteReview(String(req.params.id), user._id);
  res.status(204).end();
};
