import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { framing } from "./tunnel.ts";

describe("the framing probe", () => {
  const app = ["http://localhost:3000", "http://127.0.0.1:3000"];
  it("says a page with X-Frame-Options or a refusing frame-ancestors can't be framed, and why", () => {
    assert.deepEqual(framing({}, app), { framable: true, reason: null });
    assert.deepEqual(framing({ "x-frame-options": "DENY" }, app), { framable: false, reason: "X-Frame-Options: DENY" });
    assert.deepEqual(framing({ "content-security-policy": "default-src 'self'; frame-ancestors 'none'" }, app), {
      framable: false,
      reason: "Content-Security-Policy: frame-ancestors 'none'",
    });
    assert.deepEqual(framing({ "content-security-policy": "frame-ancestors http://localhost:3000" }, app), { framable: true, reason: null });
    assert.deepEqual(framing({ "content-security-policy": "script-src 'self'" }, app), { framable: true, reason: null });
  });
});
