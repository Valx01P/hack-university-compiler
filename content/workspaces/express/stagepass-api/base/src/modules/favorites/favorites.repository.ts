// Every query on favorites. The pair (user_id, event_id) is the primary key, so favoriting
// twice is a no-op (ON CONFLICT DO NOTHING) instead of an error.
import { and, desc, eq, getTableColumns } from "drizzle-orm";
import { events, favorites, venues } from "../../db/schema.ts";
import type { DbOrTx } from "../../db/tx.ts";
import type { EventWithVenue } from "../events/events.repository.ts";

const { search: _search, ...eventColumns } = getTableColumns(events);

export interface FavoritesRepository {
  add(db: DbOrTx, userId: number, eventId: number): Promise<void>;
  /** True when there was a favorite to remove. */
  remove(db: DbOrTx, userId: number, eventId: number): Promise<boolean>;
  /** The user's favorite events, most recently favorited first. */
  listEvents(db: DbOrTx, userId: number): Promise<Array<EventWithVenue & { favoritedAt: Date }>>;
}

export const favoritesRepository: FavoritesRepository = {
  async add(db, userId, eventId) {
    await db.insert(favorites).values({ userId, eventId }).onConflictDoNothing();
  },

  async remove(db, userId, eventId) {
    const removed = await db
      .delete(favorites)
      .where(and(eq(favorites.userId, userId), eq(favorites.eventId, eventId)))
      .returning({ eventId: favorites.eventId });
    return removed.length > 0;
  },

  async listEvents(db, userId) {
    return db
      .select({
        ...eventColumns,
        venue: { id: venues.id, name: venues.name, city: venues.city, address: venues.address, capacity: venues.capacity },
        favoritedAt: favorites.createdAt,
      })
      .from(favorites)
      .innerJoin(events, eq(events.id, favorites.eventId))
      .innerJoin(venues, eq(venues.id, events.venueId))
      .where(eq(favorites.userId, userId))
      .orderBy(desc(favorites.createdAt), desc(favorites.eventId));
  },
};
