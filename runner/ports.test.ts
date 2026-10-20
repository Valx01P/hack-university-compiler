import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { PortLeases, PortsExhausted, RESERVED, SKIPPED } from "./ports.ts";

/**
 * Port leases (architecture §4.2.6, PLAN.md 3.4), with the probe faked so the
 * test needs no real ports: 1,000 workspace scopes against the default range,
 * then a 200-port range where reclaim and ports_exhausted kick in.
 */

const free = async () => true;
let clock = 1_000;
const now = () => ++clock;

describe("port leases", () => {
  it("gives 1,000 scopes 1,000 distinct ports in the default range, and keeps them across a restart", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "hv-ports-"));
    const leases = new PortLeases({ first: 23_000, last: 29_999 }, { dataDir: dir, probe: free, now });
    const ports = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const lease = await leases.lease(`learn/typescript/l${i}/1/practice`, "PORT");
      assert.ok(lease.port >= 23_000 && lease.port <= 29_999);
      assert.ok(!SKIPPED.has(lease.port) && !RESERVED.has(lease.port));
      ports.add(lease.port);
      leases.unpin(`learn/typescript/l${i}/1/practice`);
    }
    assert.equal(ports.size, 1000);
    const again = new PortLeases({ first: 23_000, last: 29_999 }, { dataDir: dir, probe: free, now });
    for (let i = 0; i < 1000; i += 97) {
      assert.equal((await again.lease(`learn/typescript/l${i}/1/practice`, "PORT")).port, [...ports][i], "a scope keeps its port");
    }
    assert.equal(JSON.parse(readFileSync(path.join(dir, "ports.json"), "utf8")).leases.length, 1000);
  });

  it("skips ports another program holds, and moves a scope whose port was taken", async () => {
    const busy = new Set([24_000, 24_001]);
    const leases = new PortLeases({ first: 24_000, last: 24_010 }, { probe: async (p) => !busy.has(p), now });
    const a = await leases.lease("playground/typescript", "PORT");
    assert.equal(a.port, 24_002);
    leases.unpin("playground/typescript");
    busy.add(24_002);
    const b = await leases.lease("playground/typescript", "PORT");
    assert.equal(b.port, 24_003, "a new lease once the old port is taken");
  });

  it("reclaims least recently used held leases at 90%, never a pinned one, and marks them for clear-site-data", async () => {
    const leases = new PortLeases({ first: 25_000, last: 25_199 }, { probe: free, now });
    assert.equal(leases.usable, 200);
    // 179 held leases, then one more puts the range at 180 (90%).
    for (let i = 0; i < 180; i++) {
      await leases.lease(`s${i}`, "PORT");
      if (i >= 10) leases.unpin(`s${i}`);
    }
    assert.equal(leases.count, 180);
    // The next lease reclaims down below 80%: the oldest held go, the 10 pinned stay.
    const next = await leases.lease("s-new", "PORT");
    assert.ok(leases.count < 161, `reclaimed to ${leases.count}`);
    for (let i = 0; i < 10; i++) assert.ok(leases.get(`s${i}`, "PORT"), `pinned s${i} kept`);
    assert.equal(leases.get("s10", "PORT"), undefined, "the least recently used held lease went first");
    assert.ok(leases.get("s179", "PORT"), "the most recent held lease stayed");
    // A reclaimed port that's handed out again asks for its site data to be cleared, once.
    assert.equal(next.port, 25_010, "the lowest freed port");
    assert.equal(next.clearSiteData, true);
    leases.cleared(next.port);
    assert.equal(leases.get("s-new", "PORT")?.clearSiteData, undefined);
  });

  it("answers ports_exhausted when every usable port is pinned", async () => {
    const leases = new PortLeases({ first: 26_000, last: 26_199 }, { probe: free, now });
    for (let i = 0; i < 200; i++) await leases.lease(`p${i}`, "PORT");
    await assert.rejects(leases.lease("p200", "PORT"), PortsExhausted);
    leases.unpin("p7");
    assert.ok((await leases.lease("p200", "PORT")).port, "a held lease is reclaimed for it");
  });

  it("never leases a port borrowed by a forwarded server", async () => {
    const leases = new PortLeases({ first: 27_000, last: 27_002 }, { probe: free, now });
    leases.borrow(27_000);
    assert.equal((await leases.lease("x", "PORT")).port, 27_001);
    leases.giveBack(27_000);
    assert.equal((await leases.lease("y", "PORT")).port, 27_000);
  });
});
