// The view: the JSON clients get for a venue. Storage columns such as created_at stay inside.
import type { z } from "zod";
import type { VenueResponse } from "./venues.schemas.ts";
import type { Venue } from "./venues.repository.ts";

export function toVenueJson(venue: Venue): z.infer<typeof VenueResponse> {
  return { id: venue.id, name: venue.name, city: venue.city, address: venue.address, capacity: venue.capacity };
}
