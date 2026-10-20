import { HEADROOM_BYTES, PISTON_BYTES } from "./profiles.ts";

/**
 * The memory budget (architecture §4.7, PLAN.md 3.9): Docker's MemTotal, less
 * 512 MiB of headroom, less the limit of each shared service while it runs
 * (Piston 2 GiB, hu-postgres 768 MiB, hu-mongo 1 GiB), less the reserved check
 * slot of the course open in a visible tab. Each running workspace reserves
 * its memory limit.
 *
 * A start that doesn't fit stops running workspaces no tab shows, least
 * recently active first. When none qualifies it waits in a FIFO queue and
 * goes ahead by itself when memory frees. A check runs in the reserved slot,
 * and a second check at once needs room in the budget.
 */

const MiB = 1024 * 1024;
export const POSTGRES_BYTES = 768 * MiB;
export const MONGO_BYTES = 1024 * MiB;

export interface CapacityFacts {
  memTotal: number | null;
  piston: boolean;
  postgres: boolean;
  mongo: boolean;
  /** The biggest check slot among the courses open in a visible tab. */
  checkSlot: number;
}

export interface Candidate {
  id: string;
  lastActive: number;
}

interface Waiter {
  id: string;
  bytes: number;
  kind: "workspace" | "check";
  /** A check learns whether it got the slot (0) or room in the budget (its bytes). */
  resolve: (extra: number) => void;
}

export class Capacity {
  private readonly facts: () => CapacityFacts;
  private readonly overrideBytes: number | null;
  private readonly reservations = new Map<string, number>();
  private checks = 0;
  private extraCheckBytes = 0;
  private readonly queue: Waiter[] = [];

  constructor(facts: () => CapacityFacts, overrideMb: number | null) {
    this.facts = facts;
    this.overrideBytes = overrideMb === null ? null : overrideMb * MiB;
  }

  /** Memory for workspaces and checks, the check slot already taken out. */
  budget(): number {
    if (this.overrideBytes !== null) return this.overrideBytes;
    const f = this.facts();
    if (!f.memTotal) return 0;
    return Math.max(
      0,
      f.memTotal - HEADROOM_BYTES - (f.piston ? PISTON_BYTES : 0) - (f.postgres ? POSTGRES_BYTES : 0) - (f.mongo ? MONGO_BYTES : 0) - f.checkSlot
    );
  }

  reserved(): number {
    let sum = this.extraCheckBytes;
    for (const bytes of this.reservations.values()) sum += bytes;
    return sum;
  }

  holds(id: string): boolean {
    return this.reservations.has(id);
  }

  private fits(bytes: number): boolean {
    return this.reserved() + bytes <= this.budget();
  }

  /**
   * Reserves `bytes` for a workspace start. Stops hidden workspaces when it
   * must (`candidates`, least recently active first, and `stop`), and
   * otherwise waits in the queue, telling `waiting` why.
   */
  async admit(
    id: string,
    bytes: number,
    { candidates, stop, waiting }: { candidates: () => Candidate[]; stop: (id: string) => Promise<void>; waiting: (detail: string) => void }
  ): Promise<void> {
    if (this.reservations.has(id)) return;
    if (!this.queue.length && this.fits(bytes)) {
      this.reservations.set(id, bytes);
      return;
    }
    for (const c of candidates().sort((a, b) => a.lastActive - b.lastActive)) {
      if (c.id === id || !this.reservations.has(c.id)) continue;
      await stop(c.id);
      if (!this.queue.length && this.fits(bytes)) {
        this.reservations.set(id, bytes);
        return;
      }
    }
    waiting(this.waitingDetail());
    await new Promise<number>((resolve) => this.queue.push({ id, bytes, kind: "workspace", resolve }));
  }

  /** Whether `bytes` would have to wait right now (for answering 202 at once). */
  wouldWait(bytes: number, hidden: number): boolean {
    return this.queue.length > 0 || this.reserved() - hidden + bytes > this.budget();
  }

  /** A check: the reserved slot when it's free, else room in the budget. */
  async admitCheck(bytes: number): Promise<() => void> {
    if (this.checks === 0) {
      this.checks++;
      return this.releaser(0);
    }
    if (!this.queue.length && this.fits(bytes)) {
      this.checks++;
      this.extraCheckBytes += bytes;
      return this.releaser(bytes);
    }
    const extra = await new Promise<number>((resolve) => this.queue.push({ id: "", bytes, kind: "check", resolve }));
    return this.releaser(extra);
  }

  private releaser(extra: number): () => void {
    let done = false;
    return () => {
      if (done) return;
      done = true;
      this.checks--;
      this.extraCheckBytes -= extra;
      this.drain();
    };
  }

  /** Reserves without asking: a workspace found running at startup. */
  admitNow(id: string, bytes: number) {
    this.reservations.set(id, bytes);
  }

  release(id: string) {
    if (!this.reservations.delete(id)) return;
    this.drain();
  }

  /** Lets queued requests in, in order, while they fit. */
  drain() {
    while (this.queue.length) {
      const next = this.queue[0];
      if (next.kind === "check" && this.checks === 0) {
        this.queue.shift();
        this.checks++;
        next.resolve(0);
        continue;
      }
      if (!this.fits(next.bytes)) break;
      this.queue.shift();
      if (next.kind === "workspace") {
        this.reservations.set(next.id, next.bytes);
        next.resolve(0);
      } else {
        this.checks++;
        this.extraCheckBytes += next.bytes;
        next.resolve(next.bytes);
      }
    }
  }

  get queued(): number {
    return this.queue.length;
  }

  waitingDetail(): string {
    const used = this.reserved();
    const n = this.reservations.size;
    const gib = (b: number) => `${Number((b / 1024 ** 3).toFixed(2))}`;
    return `Waiting for memory: ${n} workspace${n === 1 ? "" : "s"} you have open use ${gib(used)} of ${gib(this.budget())} GiB`;
  }
}
