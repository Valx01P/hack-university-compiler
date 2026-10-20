import { readFileSync, renameSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";

/**
 * Workspace port leases (architecture §2.3, §4.2.6): a workspace container
 * gets PORT=<lease> and listens on that same number, and the runner's bridge
 * listens on it on the Mac, so the URL a server prints is the URL that works.
 *
 * - A lease is taken when a workspace container starts, never when it opens
 *   or on hover, and kept in ports.json with its scope and last use, so a
 *   workspace keeps its origin (and its localStorage) across restarts.
 * - It is pinned while its container runs. Every other lease is held.
 * - When the range reaches 90% of its usable ports, the next lease first frees
 *   held leases, least recently used first, until it is below 80%. A freed
 *   port is remembered, so the next scope that gets it clears its site data.
 * - When every usable port is pinned, a lease fails with ports_exhausted.
 * - Ports the runner and the app use, and well-known developer ports inside
 *   the range, are never leased, and each port is probed by binding it on
 *   127.0.0.1 and ::1 first, so a port another program holds is skipped.
 */

/** Never leased: Piston, the app, the runner, the lab, and the utility pages. */
export const RESERVED = new Set([2000, 3000, 3100, 4099, 4100]);
/** Skipped inside the ranges: MongoDB's, Vite's middleware HMR, CockroachDB's. */
export const SKIPPED = new Set([24678, 26257, 27017, 27018, 27019, 28017]);

export interface Lease {
  port: number;
  scope: string;
  /** The variable that carries it (PORT, API_PORT). */
  env: string;
  lastUse: number;
  /** The port last belonged to another scope: its site data must be cleared once. */
  clearSiteData?: boolean;
}

interface FileShape {
  version: 1;
  leases: Lease[];
  freed: number[];
}

export class PortsExhausted extends Error {
  readonly code = "ports_exhausted";
  constructor() {
    super("Every workspace port is in use by a running workspace. Stop one on /workspaces, or widen HU_WS_PORTS.");
  }
}

/** Whether nothing holds a port on the Mac, by binding it on 127.0.0.1 and ::1. */
export async function portFree(port: number): Promise<boolean> {
  const bind = (host: string) =>
    new Promise<boolean>((resolve) => {
      const server = net.createServer();
      server.once("error", (err: NodeJS.ErrnoException) => resolve(err.code === "EADDRNOTAVAIL" || err.code === "EAFNOSUPPORT"));
      server.listen({ port, host, exclusive: true }, () => server.close(() => resolve(true)));
    });
  return (await bind("127.0.0.1")) && (await bind("::1"));
}

export class PortLeases {
  readonly first: number;
  readonly last: number;
  private readonly file: string | null;
  private readonly probe: (port: number) => Promise<boolean>;
  private readonly now: () => number;
  private leases = new Map<string, Lease>();
  private freed = new Set<number>();
  /** Keys of leases pinned by a running container. */
  private readonly pinned = new Set<string>();
  /** Ports forwarded for a while (detected servers), so nothing else leases them meanwhile. */
  private readonly borrowed = new Set<number>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    range: { first: number; last: number },
    { dataDir, probe = portFree, now = Date.now }: { dataDir?: string; probe?: (port: number) => Promise<boolean>; now?: () => number } = {}
  ) {
    this.first = range.first;
    this.last = range.last;
    this.file = dataDir ? path.join(dataDir, "ports.json") : null;
    this.probe = probe;
    this.now = now;
    this.load();
  }

  /** Ports in the range that can ever be leased. */
  get usable(): number {
    let n = 0;
    for (let p = this.first; p <= this.last; p++) if (!RESERVED.has(p) && !SKIPPED.has(p)) n++;
    return n;
  }

  get count(): number {
    return this.leases.size;
  }

  inRange(port: number): boolean {
    return port >= this.first && port <= this.last;
  }

  /** The lease a scope holds for a variable, if any. */
  get(scope: string, env: string): Lease | undefined {
    return this.leases.get(key(scope, env));
  }

  /** Every lease a scope holds. */
  of(scope: string): Lease[] {
    return [...this.leases.values()].filter((l) => l.scope === scope);
  }

  /** Who holds a port, if anyone. */
  holder(port: number): Lease | undefined {
    for (const l of this.leases.values()) if (l.port === port) return l;
    return undefined;
  }

  isPinned(scope: string, env: string): boolean {
    return this.pinned.has(key(scope, env));
  }

  /**
   * The scope's lease for `env`, pinned: its old port when it still has one
   * and nothing else took it, else a new one. One lease at a time.
   */
  lease(scope: string, env: string): Promise<Lease> {
    const run = this.queue.then(() => this.take(scope, env));
    this.queue = run.catch(() => {});
    return run;
  }

  private async take(scope: string, env: string): Promise<Lease> {
    const k = key(scope, env);
    const held = this.leases.get(k);
    if (held) {
      if (this.pinned.has(k) || (await this.probe(held.port))) {
        held.lastUse = this.now();
        this.pinned.add(k);
        this.save();
        return held;
      }
      // Another program took it meanwhile: a new lease (the caller says so).
      this.leases.delete(k);
    }
    this.reclaim();
    const taken = new Set([...this.leases.values()].map((l) => l.port));
    for (let port = this.first; port <= this.last; port++) {
      if (RESERVED.has(port) || SKIPPED.has(port) || taken.has(port) || this.borrowed.has(port)) continue;
      if (!(await this.probe(port))) continue;
      const lease: Lease = { port, scope, env, lastUse: this.now() };
      if (this.freed.delete(port)) lease.clearSiteData = true;
      this.leases.set(k, lease);
      this.pinned.add(k);
      this.save();
      return lease;
    }
    throw new PortsExhausted();
  }

  /** At 90% of the usable ports, frees held leases, least recently used first, to below 80%. */
  private reclaim() {
    const usable = this.usable;
    if (this.leases.size < Math.floor(usable * 0.9)) return;
    const held = [...this.leases.entries()].filter(([k]) => !this.pinned.has(k)).sort((a, b) => a[1].lastUse - b[1].lastUse);
    for (const [k, lease] of held) {
      if (this.leases.size < Math.floor(usable * 0.8)) break;
      this.leases.delete(k);
      this.freed.add(lease.port);
    }
  }

  /** The container stopped: its leases are held, no longer pinned. */
  unpin(scope: string) {
    for (const [k, lease] of this.leases) {
      if (lease.scope !== scope) continue;
      this.pinned.delete(k);
      lease.lastUse = this.now();
    }
    this.save();
  }

  /** The workspace is gone: its leases too. */
  release(scope: string) {
    for (const [k, lease] of this.leases) {
      if (lease.scope !== scope) continue;
      this.leases.delete(k);
      this.pinned.delete(k);
      this.freed.add(lease.port);
    }
    this.save();
  }

  /** The IDE cleared the port's site data (it loaded /__hu/clear-site-data). */
  cleared(port: number) {
    const lease = this.holder(port);
    if (lease?.clearSiteData) {
      delete lease.clearSiteData;
      this.save();
    }
  }

  /** Keeps a port out of the leases while a detected server is forwarded on it. */
  borrow(port: number) {
    this.borrowed.add(port);
  }

  giveBack(port: number) {
    this.borrowed.delete(port);
  }

  private load() {
    if (!this.file) return;
    try {
      const data = JSON.parse(readFileSync(this.file, "utf8")) as FileShape;
      for (const l of data.leases ?? []) {
        if (Number.isInteger(l.port) && typeof l.scope === "string" && typeof l.env === "string") this.leases.set(key(l.scope, l.env), l);
      }
      for (const p of data.freed ?? []) if (Number.isInteger(p)) this.freed.add(p);
    } catch {
      /* none yet */
    }
  }

  private save() {
    if (!this.file) return;
    const data: FileShape = { version: 1, leases: [...this.leases.values()], freed: [...this.freed] };
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(data)}\n`, { mode: 0o600 });
    renameSync(tmp, this.file);
  }
}

function key(scope: string, env: string): string {
  return `${scope}#${env}`;
}
