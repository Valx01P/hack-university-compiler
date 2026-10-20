// A small in-process cache with expiry and a size limit, for hot public reads. Each server
// process has its own copy, so expiries stay short and writers must call delete(): a second
// instance would keep its stale entry until it expires (a shared cache such as Redis fixes that).
export type TtlCacheOptions = {
  ttlMs: number;
  maxEntries: number;
  /** The time source, in milliseconds. Tests move it with fake timers. */
  now?: () => number;
};

export class TtlCache<K, V> {
  readonly #entries = new Map<K, { value: V; expiresAt: number }>();
  readonly #ttlMs: number;
  readonly #maxEntries: number;
  readonly #now: () => number;

  constructor(options: TtlCacheOptions) {
    this.#ttlMs = options.ttlMs;
    this.#maxEntries = options.maxEntries;
    this.#now = options.now ?? Date.now;
  }

  get(key: K): V | undefined {
    const entry = this.#entries.get(key);
    if (entry === undefined) return undefined;
    if (entry.expiresAt <= this.#now()) {
      this.#entries.delete(key);
      return undefined;
    }
    // A Map keeps insertion order, so moving a hit to the end makes the first key the least recently used.
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V): void {
    this.#entries.delete(key);
    this.#entries.set(key, { value, expiresAt: this.#now() + this.#ttlMs });
    while (this.#entries.size > this.#maxEntries) {
      const oldest = this.#entries.keys().next();
      if (oldest.done) break;
      this.#entries.delete(oldest.value);
    }
  }

  delete(key: K): boolean {
    return this.#entries.delete(key);
  }

  clear(): void {
    this.#entries.clear();
  }

  get size(): number {
    return this.#entries.size;
  }
}
