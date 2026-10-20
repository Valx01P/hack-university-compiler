// The rules for venues. Small on purpose: this is the feature to copy when adding a new one.
// Reads of one venue go through a cache (cache-aside), and every write invalidates its entry.
import { TtlCache } from "../../cache.ts";
import type { Db } from "../../db/tx.ts";
import { NotFoundError } from "../../http/errors.ts";
import type { CreateVenue, UpdateVenue } from "./venues.schemas.ts";
import type { Venue, VenuesRepository } from "./venues.repository.ts";

export type VenuesServiceDeps = { db: Db; venues: VenuesRepository; cache?: TtlCache<number, Venue> };

export class VenuesService {
  readonly #db: Db;
  readonly #venues: VenuesRepository;
  readonly #cache: TtlCache<number, Venue>;

  constructor(deps: VenuesServiceDeps) {
    this.#db = deps.db;
    this.#venues = deps.venues;
    this.#cache = deps.cache ?? new TtlCache({ ttlMs: 60_000, maxEntries: 500 });
  }

  list(): Promise<Venue[]> {
    return this.#venues.list(this.#db);
  }

  async get(id: number): Promise<Venue> {
    const cached = this.#cache.get(id);
    if (cached !== undefined) return cached;
    const venue = await this.#venues.findById(this.#db, id);
    if (venue === null) throw new NotFoundError(`No venue with id ${id}`);
    this.#cache.set(id, venue);
    return venue;
  }

  create(input: CreateVenue): Promise<Venue> {
    return this.#venues.create(this.#db, input);
  }

  async update(id: number, changes: UpdateVenue): Promise<Venue> {
    const venue = await this.#venues.update(this.#db, id, changes);
    if (venue === null) throw new NotFoundError(`No venue with id ${id}`);
    // Without this, GET would serve the old name until the entry expired.
    this.#cache.delete(id);
    return venue;
  }
}
