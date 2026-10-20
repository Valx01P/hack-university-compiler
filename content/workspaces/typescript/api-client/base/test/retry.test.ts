// Retries, without waiting: the client gets a sleep that records each delay and returns at
// once, so a test can check both how many times Parcelly was asked and how long the SDK
// would have waited in between.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { isRetryable, isShipmentId, ParcellyError, withRetry } from "../src/index.ts";
import { startMock, type TestMock } from "./mock.ts";

let mock: TestMock;
before(async () => {
  mock = await startMock();
});
after(async () => {
  await mock.close();
});

function recorder() {
  const delays: number[] = [];
  return { delays, sleep: (ms: number) => Promise.resolve(void delays.push(ms)) };
}

function callsTo(path: string): number {
  return mock.calls.filter((call) => call.path === path).length;
}

test("503 twice, then success, on the third try, after 100 and 200 ms", async () => {
  const { delays, sleep } = recorder();
  const client = mock.client({ headers: { "x-mock-fail": "503x2" }, retry: { sleep } });
  const before = callsTo("/v1/shipments");
  assert.equal((await client.shipments.list()).items.length, 5);
  assert.equal(callsTo("/v1/shipments") - before, 3);
  assert.deepEqual(delays, [100, 200]);
});

test("a 429 waits as long as Retry-After says, in milliseconds", async () => {
  const { delays, sleep } = recorder();
  const client = mock.client({ headers: { "x-mock-rate-limit": "1" }, retry: { sleep } });
  await client.shipments.list();
  assert.deepEqual(delays, [1000]);
});

test("a 404 is asked for exactly once", async () => {
  const { delays, sleep } = recorder();
  const client = mock.client({ retry: { sleep } });
  const id = "SHP-9999";
  assert.ok(isShipmentId(id));
  const before = callsTo("/v1/shipments/SHP-9999");
  await assert.rejects(client.shipments.get(id));
  assert.equal(callsTo("/v1/shipments/SHP-9999") - before, 1);
  assert.deepEqual(delays, []);
});

test("after the last try, the last error is thrown", async () => {
  const { delays, sleep } = recorder();
  const client = mock.client({ headers: { "x-mock-fail": "503x5" }, retry: { attempts: 3, sleep } });
  await assert.rejects(client.shipments.list(), { name: "ParcellyError", kind: "http", status: 503 });
  assert.deepEqual(delays, [100, 200]);
});

test("isRetryable says yes to rate limits, network trouble, timeouts, and 502 to 504 only", () => {
  assert.equal(isRetryable(new ParcellyError("rate_limited", "x", { status: 429 })), true);
  assert.equal(isRetryable(new ParcellyError("network", "x")), true);
  assert.equal(isRetryable(new ParcellyError("timeout", "x")), true);
  assert.equal(isRetryable(new ParcellyError("http", "x", { status: 503 })), true);
  assert.equal(isRetryable(new ParcellyError("http", "x", { status: 500 })), false);
  assert.equal(isRetryable(new ParcellyError("http", "x", { status: 422 })), false);
  assert.equal(isRetryable(new ParcellyError("validation", "x")), false);
  assert.equal(isRetryable(new Error("not ours")), false);
});

test("withRetry works on any async function", async () => {
  let tries = 0;
  const result = await withRetry(
    () => {
      tries++;
      return tries < 2 ? Promise.reject(new ParcellyError("timeout", "slow")) : Promise.resolve("done");
    },
    { attempts: 3, baseDelayMs: 10, sleep: () => Promise.resolve() },
  );
  assert.equal(result, "done");
  assert.equal(tries, 2);
});
