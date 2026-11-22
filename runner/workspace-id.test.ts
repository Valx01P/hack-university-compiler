import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { describe, it } from "node:test";
import { WORKSPACE_ID, base32, isScope, parseScope, sha256, workspaceId } from "../lib/workspace-id.mjs";

/** The id rule of architecture §4.2.1, computed with node:crypto to check the module's own SHA-256. */
function reference(scope: string): string {
  return `w${base32(createHash("sha256").update(scope).digest()).slice(0, 10)}`;
}

describe("workspace ids", () => {
  it("are w and 10 base32 characters of SHA-256(scope)", () => {
    for (const scope of ["compiler/python", "compiler/typescript", "compiler/bash", "playground"]) {
      const id = workspaceId(scope);
      assert.match(id, WORKSPACE_ID);
      assert.equal(id, reference(scope));
      assert.equal(workspaceId(scope), id, "the same scope always gives the same id");
    }
  });

  it("stay what they were, so a compiler's folder and its tmux session are found again", () => {
    assert.equal(workspaceId("compiler/python"), "wxkudhw5lug");
    assert.equal(workspaceId("playground"), "w6pgip54leh");
  });

  it("name a compiler page's own folder, one per language", () => {
    assert.deepEqual(parseScope("compiler/java"), { kind: "compiler", course: "java" });
    assert.notEqual(workspaceId("compiler/python"), workspaceId("compiler/javascript"));
    for (const bad of ["compiler", "compiler/", "compiler/java/1", "compiler/Java", "compiler/java/challenge"]) assert.equal(parseScope(bad), null, bad);
  });

  it("name the one playground, which has no course of its own", () => {
    assert.deepEqual(parseScope("playground"), { kind: "playground", course: "playground" });
    assert.notEqual(workspaceId("playground"), workspaceId("compiler/playground"));
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
    for (let i = 0; i < 2000; i++) ids.add(workspaceId(`compiler/course-${i}`));
    assert.equal(ids.size, 2000);
  });

  it("refuses what isn't a scope, the retired kinds included", () => {
    for (const bad of [
      "",
      "playground/",
      "playground/typescript",
      "playground/typescript/2",
      "sandbox/go-api/taskboard-api",
      "learn/express/service-layer/1/practice",
      "challenge/typescript/orders-before-create-hook",
      "compiler/../python",
      "other/typescript",
    ]) {
      assert.equal(isScope(bad), false, bad);
      assert.throws(() => workspaceId(bad));
    }
  });
});
