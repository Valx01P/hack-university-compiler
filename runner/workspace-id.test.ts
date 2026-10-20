import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { describe, it } from "node:test";
import { WORKSPACE_ID, base32, isScope, parseScope, routeForScope, scopeForRoute, sha256, workspaceId } from "../lib/workspace-id.mjs";

/** The id rule of architecture §4.2.1, computed with node:crypto to check the module's own SHA-256. */
function reference(scope: string): string {
  return `w${base32(createHash("sha256").update(scope).digest()).slice(0, 10)}`;
}

describe("workspace ids", () => {
  it("are w and 10 base32 characters of SHA-256(scope)", () => {
    for (const scope of [
      "learn/express/service-layer/1/practice",
      "learn/typescript/modules/2/example-3",
      "challenge/typescript/orders-before-create-hook",
      "playground/bash",
      "playground/typescript/2",
      "sandbox/go-api/taskboard-api",
    ]) {
      const id = workspaceId(scope);
      assert.match(id, WORKSPACE_ID);
      assert.equal(id, reference(scope));
      assert.equal(workspaceId(scope), id, "the same scope always gives the same id");
    }
  });

  it("has a SHA-256 that matches node:crypto on every length", () => {
    for (let n = 0; n < 300; n++) {
      const bytes = randomBytes(n);
      assert.equal(Buffer.from(sha256(bytes)).toString("hex"), createHash("sha256").update(bytes).digest("hex"), `length ${n}`);
    }
  });

  it("encodes base32 the RFC 4648 way, lowercase and unpadded", () => {
    assert.equal(base32(new TextEncoder().encode("foobar")), "mzxw6ytboi");
    assert.equal(base32(new TextEncoder().encode("f")), "my");
  });

  it("differs for different scopes", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 2000; i++) ids.add(workspaceId(`learn/typescript/lesson-${i}/1/practice`));
    assert.equal(ids.size, 2000);
  });

  it("refuses what isn't a scope", () => {
    for (const bad of [
      "",
      "learn/typescript/modules/0/practice",
      "learn/typescript/modules/1/example-4",
      "learn/typescript/modules/1",
      "learn/TypeScript/modules/1/practice",
      "learn/typescript/../1/practice",
      "playground/typescript/4",
      "playground/typescript/0",
      "sandbox/typescript/123",
      "challenge/typescript",
      "other/typescript",
    ]) {
      assert.equal(isScope(bad), false, bad);
      assert.throws(() => workspaceId(bad));
    }
  });
});

describe("routes and scopes", () => {
  it("maps each route and tab to its scope", () => {
    assert.equal(scopeForRoute("/typescript/learn/modules/2", { tab: "code" }), "learn/typescript/modules/2/practice");
    assert.equal(scopeForRoute("/typescript/learn/modules/2"), "learn/typescript/modules/2/example-1");
    assert.equal(scopeForRoute("/typescript/learn/modules/2", { tab: "ex2" }), "learn/typescript/modules/2/example-2");
    assert.equal(scopeForRoute("/typescript/learn/modules/2/", { tab: "ex3" }), "learn/typescript/modules/2/example-3");
    assert.equal(scopeForRoute("/nextjs/learn/server-actions/1", { tab: "ex2", shared: true }), "learn/nextjs/server-actions/1/examples");
    assert.equal(scopeForRoute("/nextjs/learn/server-actions/1", { tab: "code", shared: true }), "learn/nextjs/server-actions/1/practice");
    assert.equal(scopeForRoute("/typescript/challenges/orders-fat-controller"), "challenge/typescript/orders-fat-controller");
    assert.equal(scopeForRoute("/bash/playground"), "playground/bash");
    assert.equal(scopeForRoute("/bash/playground/3"), "playground/bash/3");
    assert.equal(scopeForRoute("/go-api/playground/taskboard-api"), "sandbox/go-api/taskboard-api");
  });

  it("shows no workspace for other routes", () => {
    assert.equal(scopeForRoute("/typescript"), null);
    assert.equal(scopeForRoute("/typescript/learn"), null);
    assert.equal(scopeForRoute("/typescript/learn/modules/2", { tab: "ex4" }), null);
    assert.equal(scopeForRoute("/bash/playground/4"), null);
    assert.equal(scopeForRoute("/"), null);
  });

  it("goes back from a scope to its route", () => {
    for (const [pathname, tab] of [
      ["/typescript/learn/modules/2", "code"],
      ["/typescript/learn/modules/2", ""],
      ["/typescript/learn/modules/2", "ex3"],
      ["/typescript/challenges/orders-fat-controller", ""],
      ["/bash/playground", ""],
      ["/bash/playground/2", ""],
      ["/go-api/playground/taskboard-api", ""],
    ] as const) {
      const scope = scopeForRoute(pathname, { tab });
      assert.ok(scope);
      assert.deepEqual(routeForScope(scope), { pathname, tab });
    }
    assert.deepEqual(parseScope("learn/express/service-layer/1/example-2"), {
      kind: "learn", course: "express", lesson: "service-layer", part: 1, tab: "example-2", example: 2,
    });
  });
});
