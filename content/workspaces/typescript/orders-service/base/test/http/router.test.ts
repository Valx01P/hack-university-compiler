// HTTP tests for what the router decides before any controller runs: how a path's escaped
// characters reach ctx.params, and what a path that cannot be decoded gets back.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { send, startApp, type TestServer } from "../helpers/http.ts";

let server: TestServer;
before(async () => {
  server = await startApp();
});
after(async () => {
  await server.close();
});

test("escaped characters in a path segment are decoded before the controller sees them", async () => {
  const res = await send(server.baseUrl, "GET", "/orders/ord%5F0003");
  assert.equal(res.status, 200);
});

test("a path segment with a broken escape is a 400 problem, not a 500", async () => {
  const res = await send(server.baseUrl, "GET", "/orders/ord_%ZZ");
  assert.equal(res.status, 400);
  assert.match(res.type ?? "", /^application\/problem\+json/);
});
