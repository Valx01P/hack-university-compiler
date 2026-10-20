/**
 * Each workspace's events (architecture §3.3): every message goes to every
 * events socket open on the workspace, so two tabs see the same status, files,
 * ports, and tasks. File events carry a sequence number, and the last 500
 * batches are kept, so a socket that reconnects with `since` misses nothing.
 */

export type EventMessage = { t: string } & Record<string, unknown>;

export interface Subscriber {
  send(message: EventMessage): void;
}

/** One file event: ["add" | "change" | "addDir", path, entry] or ["unlink" | "unlinkDir", path]. */
export type FsEvent = [string, string, Record<string, unknown>?];

const KEEP = 500;

export class EventHub {
  private readonly subscribers = new Set<Subscriber>();
  private readonly batches: { seq: number; events: FsEvent[] }[] = [];
  private seq = 0;

  get size(): number {
    return this.subscribers.size;
  }

  get lastSeq(): number {
    return this.seq;
  }

  emit(message: EventMessage) {
    for (const sub of this.subscribers) {
      try {
        sub.send(message);
      } catch {
        /* a socket that just closed */
      }
    }
  }

  emitFs(events: FsEvent[]) {
    if (!events.length) return;
    const seq = ++this.seq;
    this.batches.push({ seq, events });
    if (this.batches.length > KEEP) this.batches.shift();
    this.emit({ t: "fs", seq, events });
  }

  /**
   * Adds a subscriber and returns what it missed since `since`: the batches
   * after it, or resync when they are gone (fetch the tree again).
   */
  subscribe(sub: Subscriber, since?: number): { seq: number; resync: boolean; missed: EventMessage[] } {
    this.subscribers.add(sub);
    if (since === undefined || since === this.seq) return { seq: this.seq, resync: false, missed: [] };
    // A sequence ahead of ours comes from before a runner restart: start over.
    if (since > this.seq) return { seq: this.seq, resync: true, missed: [] };
    const oldest = this.batches[0]?.seq ?? this.seq + 1;
    if (since < oldest - 1 || since < 0) return { seq: this.seq, resync: true, missed: [] };
    const missed = this.batches.filter((b) => b.seq > since).map((b) => ({ t: "fs", seq: b.seq, events: b.events }));
    return { seq: this.seq, resync: false, missed };
  }

  unsubscribe(sub: Subscriber) {
    this.subscribers.delete(sub);
  }
}
