// A node:test test to copy from. `npm test` runs every test/**/*.test.ts file, and Node
// strips the types first, just as it does for src/.
import assert from "node:assert/strict";
import { test } from "node:test";
import { greet } from "../src/greet.ts";

test("greet says hello to the name it gets", () => {
  assert.equal(greet("Ada"), "Hello, Ada!");
});
