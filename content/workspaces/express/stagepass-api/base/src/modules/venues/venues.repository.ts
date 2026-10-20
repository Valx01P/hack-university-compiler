// Every query on venues. Services depend on the VenuesRepository interface, and
// venuesRepository below is its PostgreSQL implementation.
import { asc, eq } from "drizzle-orm";
import { venues } from "../../db/schema.ts";
import { type DbOrTx, pgConstraint, pgErrorCode } from "../../db/tx.ts";
import { ConflictError } from "../../http/errors.ts";

export type Venue = typeof venues.$inferSelect;
export type NewVenue = Pick<Venue, "name" | "city" | "address" | "capacity">;

export interface VenuesRepository {
  list(db: DbOrTx): Promise<Venue[]>;
  findById(db: DbOrTx, id: number): Promise<Venue | null>;
  create(db: DbOrTx, venue: NewVenue): Promise<Venue>;
  /** The updated venue, or null when there is none with this id. */
  update(db: DbOrTx, id: number, changes: Partial<NewVenue>): Promise<Venue | null>;
}

// A second "Riverside Hall" in the same city is a mistake the database refuses.
function translateDuplicate(err: unknown): never {
  if (pgErrorCode(err) === "23505" && pgConstraint(err) === "venues_name_city_unique") {
    throw new ConflictError("venue-exists", "A venue with this name already exists in this city");
  }
  throw err;
}

export const venuesRepository: VenuesRepository = {
  async list(db) {
    return db.select().from(venues).orderBy(asc(venues.city), asc(venues.name), asc(venues.id));
  },

  async findById(db, id) {
    const [venue] = await db.select().from(venues).where(eq(venues.id, id));
    return venue ?? null;
  },

  async create(db, venue) {
    try {
      const [created] = await db.insert(venues).values(venue).returning();
      return created as Venue;
    } catch (err) {
      return translateDuplicate(err);
    }
  },

  async update(db, id, changes) {
    try {
      const [updated] = await db.update(venues).set(changes).where(eq(venues.id, id)).returning();
      return updated ?? null;
    } catch (err) {
      return translateDuplicate(err);
    }
  },
};
