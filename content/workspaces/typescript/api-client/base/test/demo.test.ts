// The demo, run as a child process against a test mock, the way npm run demo runs it.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { promisify } from "node:util";
import { startMock, type TestMock } from "./mock.ts";

const run = promisify(execFile);
let mock: TestMock;
before(async () => {
  mock = await startMock();
});
after(async () => {
  await mock.close();
});

test("npm run demo -- SHP-1003 prints the timeline and ETA unknown", async () => {
  const { stdout } = await run(process.execPath, [join(import.meta.dirname, "..", "examples", "track.ts"), "SHP-1003"], {
    env: { ...process.env, PARCELLY_API_KEY: "test_key_123", PARCELLY_BASE_URL: mock.baseUrl },
  });
  assert.equal(stdout, "SHP-1003  label created with USPS  1.2 kg\nETA unknown\n2026-09-30 15:00  label created\n");
});
