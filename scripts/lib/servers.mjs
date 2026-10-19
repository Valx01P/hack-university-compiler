// Starting the app's two processes, for npm run up and npm run dev: the
// workspace runner (runner/main.ts, the only process that talks to Docker)
// under a supervisor, then Next.js. Node's own modules only, like up.mjs.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const windows = process.platform === "win32";

/** ~/.hack-university (HU_DATA_DIR), created 0700. */
export function dataDir() {
  const dir = process.env.HU_DATA_DIR || path.join(os.homedir(), ".hack-university");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return realpathSync(dir);
}

/** A fresh runner token, written 0600 for the runner and Next.js to share. Every start rotates it. */
export function freshToken(dir) {
  const token = randomBytes(32).toString("base64url");
  writeFileSync(path.join(dir, "runner-token"), `${token}\n`, { mode: 0o600 });
  return token;
}

export function portBusy(port) {
  return new Promise((resolve) => {
    const socket = net.connect(port, "127.0.0.1");
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

function health(port, token) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: "127.0.0.1", port, path: "/v1/health", headers: { authorization: `Bearer ${token}`, host: `127.0.0.1:${port}` }, timeout: 2000 },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          try {
            resolve(res.statusCode === 200 ? JSON.parse(raw) : null);
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => req.destroy());
  });
}

/**
 * Starts the runner and keeps it up: a crash restarts it with backoff, at
 * most 5 times a minute. `watch` restarts it on every change to its code
 * (npm run dev). Resolves once /v1/health answers, with the health report.
 */
export function superviseRunner({ port, token, appPort, watch = false, onLine = (line) => process.stdout.write(line) }) {
  const crashes = [];
  let child = null;
  let stopping = false;
  const exited = new Set();

  const start = () => {
    const args = [...(watch ? ["--watch-path=runner", "--watch-preserve-output"] : []), path.join("runner", "main.ts")];
    if (watch) args.unshift("--watch");
    child = spawn(process.execPath, args, {
      cwd: ROOT,
      env: { ...process.env, HU_RUNNER_PORT: String(port), HU_RUNNER_TOKEN: token, PORT: String(appPort) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const prefix = (chunk) => {
      for (const line of String(chunk).split("\n")) if (line.trim()) onLine(`   [runner] ${line.replace(/^hu-runner: /, "")}\n`);
    };
    child.stdout.on("data", prefix);
    child.stderr.on("data", prefix);
    const me = child;
    me.once("exit", (code, signal) => {
      exited.add(me);
      if (stopping) return;
      const now = Date.now();
      crashes.push(now);
      while (crashes.length && crashes[0] < now - 60_000) crashes.shift();
      if (crashes.length > 5) {
        onLine(`\n✗ The workspace runner keeps stopping (${signal ?? `exit ${code}`}). TypeScript and Bash runs are off until it's back.\n  Its log is ${path.join(dataDir(), "logs", "runner.log")}. Fix that, then run npm run up again.\n`);
        return;
      }
      const wait = Math.min(16_000, 1000 * 2 ** (crashes.length - 1));
      onLine(`   [runner] stopped (${signal ?? `exit ${code}`}), restarting in ${wait / 1000} s\n`);
      setTimeout(start, wait).unref();
    });
  };
  start();

  const waitReady = async (timeoutMs = 20_000) => {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      const report = await health(port, token);
      if (report) return report;
      await new Promise((r) => setTimeout(r, 150));
    }
    throw new Error(`The workspace runner didn't answer on port ${port} within ${timeoutMs / 1000} s.`);
  };

  return {
    ready: waitReady,
    /** Stops it for good: SIGTERM, so it removes its containers first. */
    stop(signal = "SIGTERM") {
      stopping = true;
      if (!child || exited.has(child)) return Promise.resolve();
      const me = child;
      return new Promise((resolve) => {
        me.once("exit", () => resolve());
        me.kill(signal);
        setTimeout(() => me.kill("SIGKILL"), 10_000).unref();
      });
    },
  };
}

/** Runs Next.js (next start, or next dev) with the runner's address and token. */
export function serveApp({ dev, port, runnerPort, token }) {
  const npm = windows ? "npm.cmd" : "npm";
  // A pile of preview cookies on localhost must never make the app answer 431.
  const nodeOptions = [process.env.NODE_OPTIONS, "--max-http-header-size=65536"].filter(Boolean).join(" ");
  const args = dev ? ["exec", "--no", "--", "next", "dev", "--hostname", "127.0.0.1"] : ["run", "start"];
  return spawn(npm, args, {
    cwd: ROOT,
    stdio: "inherit",
    shell: windows,
    env: {
      ...process.env,
      PORT: String(port),
      HU_RUNNER_PORT: String(runnerPort),
      HU_RUNNER_URL: `http://127.0.0.1:${runnerPort}`,
      HU_RUNNER_TOKEN: token,
      NODE_OPTIONS: nodeOptions,
    },
  });
}

/** Ctrl+C reaches every process in the terminal's group at once, so both
    stop together: Next.js, and the runner, which removes its containers. */
export function stopTogether(app, runner) {
  let stopping = false;
  const stop = async (signal) => {
    if (stopping) return;
    stopping = true;
    // Tell the supervisor first, so the runner's exit isn't taken for a crash.
    const runnerStopped = runner.stop();
    if (app.exitCode === null && app.signalCode === null) {
      if (signal !== "SIGINT") app.kill(signal);
      await new Promise((resolve) => app.once("exit", resolve));
    }
    await runnerStopped;
    process.exit(0);
  };
  process.on("SIGINT", () => void stop("SIGINT"));
  process.on("SIGTERM", () => void stop("SIGTERM"));
  app.on("exit", (code) => {
    if (stopping) return;
    stopping = true;
    void runner.stop().then(() => process.exit(code ?? 0));
  });
}
