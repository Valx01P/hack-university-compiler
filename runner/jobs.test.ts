import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Demux, JobPool, splitTrailer } from "./jobs.ts";

function frame(stream: 1 | 2, text: string): Buffer {
  const data = Buffer.from(text);
  const head = Buffer.alloc(8);
  head[0] = stream;
  head.writeUInt32BE(data.length, 4);
  return Buffer.concat([head, data]);
}

describe("Docker's exec stream", () => {
  it("splits into stdout and stderr, however the bytes arrive", () => {
    const all = Buffer.concat([frame(1, "out 1\n"), frame(2, "err\n"), frame(1, "out 2\n")]);
    for (const size of [1, 3, 7, 8, 9, all.length]) {
      const seen: string[] = [];
      const demux = new Demux((stream, data) => seen.push(`${stream}:${data}`));
      for (let i = 0; i < all.length; i += size) demux.push(all.subarray(i, i + size));
      assert.deepEqual(seen, ["1:out 1\n", "2:err\n", "1:out 2\n"], `chunks of ${size}`);
    }
  });
});

describe("hu-exec's status line", () => {
  it("comes off the end of stderr", () => {
    const { stderr, trailer } = splitTrailer(Buffer.from("boom\n\0hu-exec code=130 signal=0 timeout=0 oom=0 pids=0 ms=12\n"));
    assert.equal(stderr.toString(), "boom\n");
    assert.deepEqual(trailer, { code: 130, signal: 0, timedOut: false, oom: false, pids: false, ms: 12 });
  });

  it("says when a step died on a signal or hit a limit", () => {
    const { trailer } = splitTrailer(Buffer.from("\0hu-exec code=-1 signal=9 timeout=1 oom=1 pids=2 ms=10000\n"));
    assert.deepEqual(trailer, { code: -1, signal: 9, timedOut: true, oom: true, pids: true, ms: 10000 });
  });

  it("is only the last one, so a program can't fake it", () => {
    const fake = "\0hu-exec code=0 signal=0 timeout=0 oom=0 pids=0 ms=1\n";
    const { stderr, trailer } = splitTrailer(Buffer.from(`${fake}\0hu-exec code=3 signal=0 timeout=0 oom=0 pids=0 ms=5\n`));
    assert.equal(stderr.toString(), fake);
    assert.equal(trailer?.code, 3);
    assert.equal(splitTrailer(Buffer.from("no status line\n")).trailer, null);
  });
});

describe("the job pool", () => {
  it("runs at most `slots` jobs at once, first in first out", async () => {
    const pool = new JobPool(2);
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const job = (name: string, wait?: Promise<void>) =>
      pool.run(async () => {
        order.push(`start ${name}`);
        await wait;
        order.push(`end ${name}`);
      });
    const all = [job("a", gate), job("b", gate), job("c"), job("d")];
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(pool.stats, { running: 2, queued: 2 });
    release();
    await Promise.all(all);
    assert.deepEqual(order.slice(0, 2), ["start a", "start b"]);
    assert.ok(order.indexOf("start c") > order.indexOf("end a"));
    assert.ok(order.indexOf("start c") < order.indexOf("start d"));
    assert.deepEqual(pool.stats, { running: 0, queued: 0 });
  });

  it("drops a queued job that is cancelled", async () => {
    const pool = new JobPool(1);
    let release!: () => void;
    const first = pool.run(() => new Promise<void>((r) => (release = r)));
    const abort = new AbortController();
    const second = pool.run(async () => "ran", abort.signal);
    abort.abort();
    await assert.rejects(second, /cancelled/);
    release();
    await first;
    assert.deepEqual(pool.stats, { running: 0, queued: 0 });
  });
});
