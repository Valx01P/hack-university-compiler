import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Who may talk to the runner (architecture §3.2, §3.3, invariant I10).
 *
 * - The HTTP API is for the Next.js server only: it needs the bearer token
 *   from ~/.hack-university/runner-token, and any request that carries an
 *   Origin header came from a browser, so it is refused.
 * - WebSockets are for the browser: they need the app's Origin and a
 *   single-use ticket (from POST /v1/tickets, through Next) as their first
 *   message. Never cookies: a preview on another localhost port is same-site
 *   with the runner, so SameSite would not stop it.
 * - Both accept only the runner's own Host, so a DNS-rebinding page that
 *   points evil.example at 127.0.0.1 is refused.
 */

/** A fresh token: 32 random bytes, base64url. */
export function createToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Whether an Authorization header carries the token, compared in constant time. */
export function bearerMatches(header: string | undefined, token: string): boolean {
  const match = /^Bearer ([A-Za-z0-9._~+/=-]+)$/.exec(header ?? "");
  if (!match) return false;
  // Hash both sides so the comparison takes the same time whatever the length.
  const a = createHash("sha256").update(match[1]).digest();
  const b = createHash("sha256").update(token).digest();
  return timingSafeEqual(a, b);
}

/** The Host values the runner answers to: 127.0.0.1:<port> and localhost:<port>. */
export function hostAllowed(host: string | undefined, port: number): boolean {
  if (!host) return false;
  const h = host.toLowerCase();
  return h === `127.0.0.1:${port}` || h === `localhost:${port}`;
}

/** The app's own origins, the only ones whose pages may open a runner WebSocket. */
export function appOrigins(appPort: number): string[] {
  return [`http://localhost:${appPort}`, `http://127.0.0.1:${appPort}`];
}

export function originAllowed(origin: string | undefined, appPort: number): boolean {
  return origin !== undefined && appOrigins(appPort).includes(origin.toLowerCase());
}

export type TicketKind = "events" | "term";

export interface TicketBinding {
  workspace: string;
  kind: TicketKind;
  /** The terminal session a "term" ticket opens. */
  sid?: string;
}

export type Redeemed =
  | { ok: true; binding: TicketBinding }
  | { ok: false; reason: "unknown" | "expired" | "mismatch" };

/**
 * Single-use WebSocket tickets: 32 random bytes, valid for 30 seconds, bound
 * to a workspace, a socket kind, and (for terminals) a session. A ticket is
 * spent the moment anyone presents it, even when it doesn't match, so a page
 * can't probe with one. Only a hash of each ticket is kept.
 */
export class Tickets {
  private readonly live = new Map<string, TicketBinding & { expiresAt: number }>();
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(ttlMs = 30_000, now: () => number = Date.now) {
    this.ttlMs = ttlMs;
    this.now = now;
  }

  issue(binding: TicketBinding): { ticket: string; expiresAt: number } {
    this.sweep();
    const ticket = randomBytes(32).toString("base64url");
    const expiresAt = this.now() + this.ttlMs;
    this.live.set(hash(ticket), { ...binding, expiresAt });
    return { ticket, expiresAt };
  }

  /** Spends a ticket presented on a socket of `kind` (and `sid`, for terminals). */
  redeem(ticket: unknown, kind: TicketKind, sid?: string): Redeemed {
    if (typeof ticket !== "string" || ticket.length > 128) return { ok: false, reason: "unknown" };
    const key = hash(ticket);
    const entry = this.live.get(key);
    if (!entry) return { ok: false, reason: "unknown" };
    this.live.delete(key);
    if (entry.expiresAt <= this.now()) return { ok: false, reason: "expired" };
    if (entry.kind !== kind || (kind === "term" && entry.sid !== sid)) return { ok: false, reason: "mismatch" };
    const { expiresAt: _, ...binding } = entry;
    return { ok: true, binding };
  }

  get size(): number {
    return this.live.size;
  }

  private sweep() {
    const now = this.now();
    for (const [key, entry] of this.live) if (entry.expiresAt <= now) this.live.delete(key);
  }
}

function hash(ticket: string): string {
  return createHash("sha256").update(ticket).digest("hex");
}
