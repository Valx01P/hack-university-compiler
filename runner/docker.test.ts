import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { resolveEndpoint } from "./docker.ts";

/** A fake home with a docker config and one context, the way the CLI stores them. */
function home(current?: string, endpoint = "unix:///Users/me/.docker/run/docker.sock"): string {
  const dir = mkdtempSync(path.join(tmpdir(), "hu-home-"));
  const docker = path.join(dir, ".docker");
  mkdirSync(docker);
  if (current) writeFileSync(path.join(docker, "config.json"), JSON.stringify({ currentContext: current }));
  const id = createHash("sha256").update("desktop-linux").digest("hex");
  mkdirSync(path.join(docker, "contexts", "meta", id), { recursive: true });
  writeFileSync(
    path.join(docker, "contexts", "meta", id, "meta.json"),
    JSON.stringify({ Name: "desktop-linux", Endpoints: { docker: { Host: endpoint } } })
  );
  return dir;
}

describe("finding Docker", () => {
  it("uses DOCKER_HOST first", () => {
    assert.deepEqual(resolveEndpoint({ DOCKER_HOST: "unix:///tmp/d.sock" }, home("desktop-linux")), {
      socketPath: "/tmp/d.sock",
      source: "DOCKER_HOST",
      dockerHost: "unix:///tmp/d.sock",
    });
    const tcp = resolveEndpoint({ DOCKER_HOST: "tcp://127.0.0.1:2375" }, home());
    assert.equal(tcp.host, "127.0.0.1");
    assert.equal(tcp.port, 2375);
    assert.equal(tcp.protocol, "http");
  });

  it("reads a Windows named pipe, from DOCKER_HOST or a context", () => {
    assert.deepEqual(resolveEndpoint({ DOCKER_HOST: "npipe:////./pipe/docker_engine" }, home()), {
      socketPath: "//./pipe/docker_engine",
      source: "DOCKER_HOST",
      dockerHost: "npipe:////./pipe/docker_engine",
    });
    const e = resolveEndpoint({}, home("desktop-linux", "npipe:////./pipe/dockerDesktopLinuxEngine"));
    assert.equal(e.socketPath, "//./pipe/dockerDesktopLinuxEngine");
  });

  it("then the active context, like the docker CLI", () => {
    const e = resolveEndpoint({}, home("desktop-linux"));
    assert.equal(e.socketPath, "/Users/me/.docker/run/docker.sock");
    assert.equal(e.source, "context desktop-linux");
  });

  it("honors DOCKER_CONTEXT over the config file", () => {
    const e = resolveEndpoint({ DOCKER_CONTEXT: "default" }, home("desktop-linux"));
    assert.equal(e.socketPath, "/var/run/docker.sock");
  });

  it("falls back to the default socket", () => {
    assert.equal(resolveEndpoint({}, home()).socketPath, "/var/run/docker.sock");
    assert.equal(resolveEndpoint({}, home("missing-context")).socketPath, "/var/run/docker.sock");
  });
});
