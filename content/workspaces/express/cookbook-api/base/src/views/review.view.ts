// Turns a Review document into client JSON. The author is an id or { id, name } when populated,
// and null for a review whose author deleted their account (authorName still shows who wrote it).
import type { Types } from "mongoose";
import type { Review } from "../models/review.model.ts";

type PopulatedAuthor = { _id: Types.ObjectId; name: string };

export type ReviewView = {
  id: string;
  recipe: string;
  author: string | { id: string; name: string } | null;
  authorName: string;
  rating: number;
  body: string;
  createdAt: string;
};

export function presentReview(review: Review): ReviewView {
  const author = review.author as Types.ObjectId | PopulatedAuthor | null;
  let authorView: string | { id: string; name: string } | null = null;
  if (author && typeof author === "object" && "name" in author) authorView = { id: String(author._id), name: author.name };
  else if (author) authorView = String(author);

  return {
    id: String(review._id),
    recipe: String(review.recipe),
    author: authorView,
    authorName: review.authorName,
    rating: review.rating,
    body: review.body,
    createdAt: review.createdAt.toISOString(),
  };
}
