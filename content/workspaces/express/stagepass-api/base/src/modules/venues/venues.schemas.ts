// What venue requests may contain, and the JSON venue responses have.
import { z } from "zod";
import { idParam } from "../../http/validate.ts";

export const VenueIdParams = z.object({ venueId: idParam });
export type VenueIdParams = z.infer<typeof VenueIdParams>;

export const CreateVenue = z.strictObject({
  name: z.string().trim().min(2).max(100),
  city: z.string().trim().min(2).max(60),
  address: z.string().trim().min(3).max(200),
  capacity: z.int().min(1).max(100_000),
});
export type CreateVenue = z.infer<typeof CreateVenue>;

// Every field optional, but an empty body is a mistake worth reporting.
export const UpdateVenue = CreateVenue.partial().refine((changes) => Object.keys(changes).length > 0, {
  message: "Send at least one field to change",
});
export type UpdateVenue = z.infer<typeof UpdateVenue>;

export const VenueResponse = z.object({
  id: z.int(),
  name: z.string(),
  city: z.string(),
  address: z.string(),
  capacity: z.int(),
});
