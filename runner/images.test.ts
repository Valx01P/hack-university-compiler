import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import type Docker from "dockerode";
import { ROOT } from "./config.ts";
import { CORE_IMAGES, IMAGES, Images, imageHash, templateFiles } from "./images.ts";

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

describe("stack images", () => {
  function copyOfDocker(): string {
    const copy = mkdtempSync(path.join(tmpdir(), "hu-images-"));
    cpSync(path.join(ROOT, "docker"), path.join(copy, "docker"), { recursive: true });
    return copy;
  }

  it("leave npm run up with the core images only", () => {
    assert.deepEqual(CORE_IMAGES, ["node", "bash"]);
    for (const name of Object.keys(IMAGES)) assert.ok(existsSync(path.join(ROOT, IMAGES[name as keyof typeof IMAGES].dockerfile)), name);
  });

  it("hash their parent's tag, so hu/web follows hu/node", () => {
    const copy = copyOfDocker();
    const before = { web: imageHash(copy, "web"), python: imageHash(copy, "python") };
    writeFileSync(path.join(copy, "docker/node/Dockerfile"), "# changed\n", { flag: "a" });
    assert.notEqual(imageHash(copy, "web"), before.web);
    assert.equal(imageHash(copy, "python"), before.python);
  });

  it("hash their courses' template lockfiles, and nothing else in a template", () => {
    const copy = copyOfDocker();
    const before = { web: imageHash(copy, "web"), python: imageHash(copy, "python"), go: imageHash(copy, "go") };
    const template = path.join(copy, "content/workspaces/express/taskboard-api");
    mkdirSync(path.join(template, "base/node_modules/zod"), { recursive: true });
    mkdirSync(path.join(template, "checkpoints/cp-02/overlay"), { recursive: true });
    writeFileSync(path.join(template, "base/package.json"), '{"name":"t"}');
    writeFileSync(path.join(template, "base/package-lock.json"), '{"lockfileVersion":3}');
    writeFileSync(path.join(template, "base/node_modules/zod/package.json"), '{"name":"zod"}');
    writeFileSync(path.join(template, "base/server.ts"), "export {};");
    writeFileSync(path.join(template, "checkpoints/cp-02/overlay/package-lock.json"), '{"lockfileVersion":3}');
    assert.deepEqual(templateFiles(copy, "web"), [
      "express/taskboard-api/base/package-lock.json",
      "express/taskboard-api/base/package.json",
      "express/taskboard-api/checkpoints/cp-02/overlay/package-lock.json",
    ]);
    const withLock = imageHash(copy, "web");
    assert.notEqual(withLock, before.web);
    writeFileSync(path.join(template, "base/server.ts"), "export const changed = 1;");
    assert.equal(imageHash(copy, "web"), withLock);
    assert.equal(imageHash(copy, "python"), before.python);
    mkdirSync(path.join(copy, "content/workspaces/go-api/notes-api/base"), { recursive: true });
    writeFileSync(path.join(copy, "content/workspaces/go-api/notes-api/base/go.sum"), "");
    assert.notEqual(imageHash(copy, "go"), before.go);
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
