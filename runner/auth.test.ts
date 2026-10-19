import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Tickets, appOrigins, bearerMatches, createToken, hostAllowed, originAllowed } from "./auth.ts";

describe("tokens", () => {
  it("are 32 random bytes in base64url", () => {
    const a = createToken();
    const b = createToken();
    assert.match(a, /^[A-Za-z0-9_-]{43}$/);
    assert.notEqual(a, b);
  });

  it("match only the exact bearer header", () => {
    const token = createToken();
    assert.equal(bearerMatches(`Bearer ${token}`, token), true);
    assert.equal(bearerMatches(undefined, token), false);
    assert.equal(bearerMatches("", token), false);
    assert.equal(bearerMatches(token, token), false);
    assert.equal(bearerMatches(`bearer ${token}`, token), false);
    assert.equal(bearerMatches(`Bearer ${token}x`, token), false);
    assert.equal(bearerMatches(`Bearer ${token.slice(1)}`, token), false);
    assert.equal(bearerMatches(`Basic ${token}`, token), false);
  });
});

describe("Host and Origin rules", () => {
  it("accept only the runner's own Host", () => {
    assert.equal(hostAllowed("127.0.0.1:3100", 3100), true);
    assert.equal(hostAllowed("localhost:3100", 3100), true);
    assert.equal(hostAllowed("LOCALHOST:3100", 3100), true);
    assert.equal(hostAllowed("127.0.0.1:3101", 3100), false);
    assert.equal(hostAllowed("127.0.0.1", 3100), false);
    assert.equal(hostAllowed("evil.example:3100", 3100), false);
    assert.equal(hostAllowed("[::1]:3100", 3100), false);
    assert.equal(hostAllowed(undefined, 3100), false);
  });

  it("let WebSockets in only from the app's origins, following its port", () => {
    assert.deepEqual(appOrigins(3000), ["http://localhost:3000", "http://127.0.0.1:3000"]);
    assert.equal(originAllowed("http://localhost:3000", 3000), true);
    assert.equal(originAllowed("http://127.0.0.1:3000", 3000), true);
    assert.equal(originAllowed("http://localhost:3001", 3000), false);
    assert.equal(originAllowed("http://localhost:23017", 3000), false);
    assert.equal(originAllowed("https://localhost:3000", 3000), false);
    assert.equal(originAllowed("http://evil.example", 3000), false);
    assert.equal(originAllowed("null", 3000), false);
    assert.equal(originAllowed(undefined, 3000), false);
    assert.equal(originAllowed("http://localhost:4000", 4000), true);
  });
});

describe("tickets", () => {
  const binding = { workspace: "wk3j6q2m7xa", kind: "events" as const };

  it("are single use", () => {
    const tickets = new Tickets();
    const { ticket } = tickets.issue(binding);
    assert.deepEqual(tickets.redeem(ticket, "events"), { ok: true, binding: { ...binding } });
    assert.deepEqual(tickets.redeem(ticket, "events"), { ok: false, reason: "unknown" });
  });

  it("expire after their time to live", () => {
    let now = 1_000;
    const tickets = new Tickets(30_000, () => now);
    const { ticket, expiresAt } = tickets.issue(binding);
    assert.equal(expiresAt, 31_000);
    now = 31_000;
    assert.deepEqual(tickets.redeem(ticket, "events"), { ok: false, reason: "expired" });
  });

  it("are bound to a socket kind and a terminal session, and burn on a mismatch", () => {
    const tickets = new Tickets();
    const events = tickets.issue(binding).ticket;
    assert.deepEqual(tickets.redeem(events, "term", "s1abcdef"), { ok: false, reason: "mismatch" });
    assert.deepEqual(tickets.redeem(events, "events"), { ok: false, reason: "unknown" });

    const term = tickets.issue({ workspace: "wk3j6q2m7xa", kind: "term", sid: "s1abcdef" }).ticket;
    assert.deepEqual(tickets.redeem(term, "term", "s2abcdef"), { ok: false, reason: "mismatch" });
    const term2 = tickets.issue({ workspace: "wk3j6q2m7xa", kind: "term", sid: "s1abcdef" }).ticket;
    assert.equal(tickets.redeem(term2, "term", "s1abcdef").ok, true);
  });

  it("refuse junk and never keep the ticket itself", () => {
    const tickets = new Tickets();
    assert.deepEqual(tickets.redeem(undefined, "events"), { ok: false, reason: "unknown" });
    assert.deepEqual(tickets.redeem(42, "events"), { ok: false, reason: "unknown" });
    assert.deepEqual(tickets.redeem("x".repeat(500), "events"), { ok: false, reason: "unknown" });
    const { ticket } = tickets.issue(binding);
    assert.match(ticket, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(JSON.stringify([...(tickets as unknown as { live: Map<string, unknown> }).live.keys()]).includes(ticket), false);
  });

  it("sweeps expired tickets when issuing", () => {
    let now = 0;
    const tickets = new Tickets(10, () => now);
    tickets.issue(binding);
    tickets.issue(binding);
    now = 20;
    tickets.issue(binding);
    assert.equal(tickets.size, 1);
  });
});
