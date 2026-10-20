// An ingredient is part of a recipe, never stored on its own, so it is an embedded subdocument
// with no _id of its own. Recipes hold an array of these.
import { Schema } from "mongoose";

export const UNITS = ["g", "kg", "ml", "l", "tsp", "tbsp", "cup", "piece", "pinch", "clove"] as const;

export interface Ingredient {
  name: string;
  quantity: number;
  unit: (typeof UNITS)[number];
}

export const ingredientSchema = new Schema<Ingredient>(
  {
    name: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 0 },
    unit: { type: String, required: true, enum: UNITS },
  },
  { _id: false },
);
