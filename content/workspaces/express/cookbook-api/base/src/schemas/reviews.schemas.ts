// What the review routes accept. The rating is a whole number from 1 to 5; the body is optional.
import * as z from "zod";

export const CreateReviewBody = z.strictObject({
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().max(2000).optional(),
});

export const ReviewIdParam = z.object({
  id: z.string().trim().min(1).max(200),
});

export type CreateReviewInput = z.infer<typeof CreateReviewBody>;
