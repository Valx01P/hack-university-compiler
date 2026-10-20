import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { ROOT } from "./config.ts";
import { IMAGES } from "./images.ts";
import { STACKS, stack, type StackName } from "./stacks.ts";

describe("the stacks table", () => {
  const courses = JSON.parse(readFileSync(path.join(ROOT, "content", "courses.json"), "utf8")).courses as {
    slug: string;
    runtime: string;
  }[];

  it("has every course the runner runs, and only those", () => {
    const runner = courses.filter((c) => c.runtime.startsWith("runner:") || c.runtime === "browser").map((c) => c.slug);
    assert.deepEqual(Object.keys(STACKS).sort(), runner.sort());
  });

  it("names images the runner builds, and a course's image is the one its runtime implies", () => {
    const expected: Record<string, string> = {
      typescript: "node", bash: "bash", web: "web", react: "web", nextjs: "web", express: "web",
      fastapi: "python", spring: "java", "go-api": "go",
    };
    for (const name of Object.keys(STACKS) as StackName[]) {
      assert.ok(Object.hasOwn(IMAGES, stack(name).image), name);
      assert.equal(stack(name).image, expected[name], name);
    }
  });

  it("gives every course with dependencies a lockfile, an install command, and somewhere to put them", () => {
    for (const name of Object.keys(STACKS) as StackName[]) {
      const { deps, commands } = stack(name);
      if (deps.kind === "none") continue;
      assert.ok(deps.lockfile, name);
      assert.ok(commands.install, name);
    }
    assert.equal(stack("fastapi").env?.UV_PROJECT_ENVIRONMENT, stack("fastapi").deps.target);
    assert.deepEqual(stack("go-api").volumes, [{ name: "hu-go-build", target: "/opt/hu/go-build" }]);
  });
});
