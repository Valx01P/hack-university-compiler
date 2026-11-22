import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import type Docker from "dockerode";
import { ROOT } from "./config.ts";
import { CORE_IMAGES, IMAGES, Images, imageHash } from "./images.ts";

describe("image tags", () => {
  it("hash the Dockerfile and every file it copies, and nothing else", () => {
    const copy = mkdtempSync(path.join(tmpdir(), "hu-images-"));
    cpSync(path.join(ROOT, "docker"), path.join(copy, "docker"), { recursive: true });
    const before = { node: imageHash(copy, "node"), bash: imageHash(copy, "bash") };
    assert.equal(before.node, imageHash(ROOT, "node"));
    assert.match(before.node, /^[0-9a-f]{12}$/);
    writeFileSync(path.join(copy, "docker/bash/.DS_Store"), "noise");
    assert.equal(imageHash(copy, "bash"), before.bash);
    writeFileSync(path.join(copy, "docker/bash/Dockerfile"), "# changed\n", { flag: "a" });
    assert.notEqual(imageHash(copy, "bash"), before.bash);
    assert.equal(imageHash(copy, "node"), before.node);
    writeFileSync(path.join(copy, "docker/shared/hu-exec.c"), "/* changed */\n", { flag: "a" });
    assert.notEqual(imageHash(copy, "node"), before.node);
  });
});

describe("the images", () => {
  it("are hu/node and hu/bash, both built by npm run up", () => {
    assert.deepEqual(CORE_IMAGES, ["node", "bash"]);
    for (const name of Object.keys(IMAGES)) assert.ok(existsSync(path.join(ROOT, IMAGES[name as keyof typeof IMAGES].dockerfile)), name);
  });
});

describe("pruning", () => {
  it("keeps the current tag and the one before it, whatever else carries the labels", async () => {
    const images = new Images(ROOT, {} as Docker, "unix:///nowhere.sock");
    const current = images.tag("node");
    const removed: string[] = [];
    const docker = {
      listImages: async () => [
        { RepoTags: [current], Created: 50 },
        // Built FROM hu/node (an older install's hu/web), so it inherits hu/node's labels.
        { RepoTags: ["someone/else:latest"], Created: 40 },
        { RepoTags: ["hu/node:aaaaaaaaaaaa"], Created: 30 },
        { RepoTags: ["hu/node:bbbbbbbbbbbb"], Created: 20 },
        { RepoTags: ["hu/node:cccccccccccc"], Created: 10 },
      ],
      getImage: (tag: string) => ({ remove: async () => void removed.push(tag) }),
    } as unknown as Docker;
    Object.assign(images, { docker });
    assert.deepEqual(await images.prune("node"), ["hu/node:bbbbbbbbbbbb", "hu/node:cccccccccccc"]);
    assert.deepEqual(removed, ["hu/node:bbbbbbbbbbbb", "hu/node:cccccccccccc"]);
  });
});

describe("a build started through the runner", () => {
  it("reads the new image's state and versions as soon as it's built", async () => {
    // Docker knows the image once the build has made it. The docker CLI is a
    // stand-in that succeeds, first on PATH.
    const built = new Set<string>();
    const docker = {
      getImage: (tag: string) => ({
        inspect: async () => {
          if (!built.has(tag)) throw Object.assign(new Error(`No such image: ${tag}`), { statusCode: 404 });
          return { Config: { Labels: { "hu.versions": '{"node":"26.12.0","typescript":"7.0.2"}' } } };
        },
      }),
      listImages: async () => [],
    } as unknown as Docker;
    const bin = mkdtempSync(path.join(tmpdir(), "hu-cli-"));
    writeFileSync(path.join(bin, "docker"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });

    const images = new Images(ROOT, docker, "unix:///nowhere.sock");
    await images.refresh();
    assert.equal(images.state("node"), "missing");
    const PATH = process.env.PATH;
    process.env.PATH = `${bin}${path.delimiter}${PATH}`;
    try {
      const build = images.build("node");
      assert.equal(images.state("node"), "building");
      built.add(images.tag("node"));
      await build;
    } finally {
      process.env.PATH = PATH;
    }
    assert.equal(images.state("node"), "ready");
    assert.deepEqual(images.versionsOf("node"), { node: "26.12.0", typescript: "7.0.2" });
  });
});
