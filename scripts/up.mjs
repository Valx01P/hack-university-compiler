#!/usr/bin/env node
// One command from a fresh clone to a running app:
//
//   npm run up            # set up whatever's missing, then serve the app
//   npm run up -- --dev   # the same, then the dev server instead
//
// Each step is skipped when it's already done, so running it again is quick:
//
//   1. Checks for Node 24.12+ and a running Docker (the code sandbox).
//   2. npm install, when node_modules is missing or out of date.
//   3. Starts the sandbox and installs any missing languages (about 5 GB the
//      first time, a few minutes).
//   4. Downloads the cheatsheet search's model (30 MB, once).
//   5. Builds the app, when its code changed since the last build.
//   6. Serves it on http://localhost:3000. Ctrl+C stops the app, and
//      npm run piston:down stops the sandbox.
//
// Only Node's own modules here: this runs before npm install has.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import net from "node:net";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dev = process.argv.includes("--dev");
// next start and next dev listen on PORT too.
const PORT = Number(process.env.PORT) || 3000;
const windows = process.platform === "win32";
const npm = windows ? "npm.cmd" : "npm";
// Next.js reports each build and dev session to telemetry.nextjs.org (with
// this machine's OS, CPU, and memory, and the coding agent running it, if
// any). The app stays offline, so the build and the server started below
// inherit this and report nothing.
process.env.NEXT_TELEMETRY_DISABLED = "1";

let stepNo = 0;
const step = (text) => console.log(`\n\u001b[1m${++stepNo}. ${text}\u001b[0m`);
const done = (text) => console.log(`   ✓ ${text}`);
function fail(message) {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}
function run(cmd, args, { quiet = false } = {}) {
  return spawnSync(cmd, args, { cwd: ROOT, stdio: quiet ? "pipe" : "inherit", shell: windows, encoding: "utf8" });
}
function npmRun(...args) {
  const r = run(npm, args);
  if (r.status !== 0) fail(`npm ${args.join(" ")} failed (see above). Fix that, then run npm run up again.`);
}

// 1. Node and Docker -------------------------------------------------------
step("Checking Node and Docker");
const need = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")).engines.node.replace(/[^\d.]/g, "");
const older = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split(".").map(Number));
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0);
  return false;
};
if (older(process.versions.node, need)) {
  fail(`This needs Node ${need} or newer, and this is ${process.versions.node}. Get it from https://nodejs.org, then run npm run up again.`);
}
done(`Node ${process.versions.node}`);
const docker = run("docker", ["info", "--format", "{{.ServerVersion}}"], { quiet: true });
if (docker.error) fail("Docker isn't installed. Get Docker Desktop from https://docs.docker.com/get-docker/, then run npm run up again.");
if (docker.status !== 0) fail("Docker isn't running. Start Docker Desktop, then run npm run up again.");
done(`Docker ${docker.stdout.trim()}`);

// 2. Dependencies -------------------------------------------------------------
step("Installing dependencies");
const lock = path.join(ROOT, "package-lock.json");
const installed = path.join(ROOT, "node_modules", ".package-lock.json");
if (existsSync(installed) && statSync(installed).mtimeMs >= statSync(lock).mtimeMs) done("already installed");
else npmRun("install", "--no-audit", "--no-fund");

// 3. The sandbox and its languages -------------------------------------------
step("Starting the code sandbox and its languages");
npmRun("run", "--silent", "piston:up");
npmRun("run", "--silent", "piston:install");

// 4. The search model -----------------------------------------------------------
step("Getting the cheatsheet search model");
npmRun("run", "--silent", "search:setup");

// 5. The build ------------------------------------------------------------------
// Rebuilt when any file the app is built from is newer than the last build.
function newest(entry) {
  const full = path.join(ROOT, entry);
  if (!existsSync(full)) return 0;
  const stat = statSync(full);
  if (!stat.isDirectory()) return stat.mtimeMs;
  let latest = stat.mtimeMs;
  for (const name of readdirSync(full)) latest = Math.max(latest, newest(path.join(entry, name)));
  return latest;
}
if (!dev) {
  step("Building the app");
  const buildId = path.join(ROOT, ".next", "BUILD_ID");
  const sources = ["app", "components", "lib", "content", "public", "next.config.ts", "package-lock.json", "tsconfig.json", "postcss.config.mjs"];
  if (existsSync(buildId) && Math.max(...sources.map(newest)) <= statSync(buildId).mtimeMs) done("up to date");
  else npmRun("run", "build");
}

// 6. Serve ----------------------------------------------------------------------
const busy = await new Promise((resolve) => {
  const socket = net.connect(PORT, "127.0.0.1");
  socket.once("connect", () => {
    socket.destroy();
    resolve(true);
  });
  socket.once("error", () => resolve(false));
});
if (busy) {
  fail(`Something is already using port ${PORT}. If it's this app, it's up at http://localhost:${PORT}. Otherwise stop it, then run npm run up again.`);
}
console.log(`\n\u001b[1mHack University is starting on http://localhost:${PORT}\u001b[0m${dev ? " (dev server)" : ""}`);
console.log("Ctrl+C stops it. npm run piston:down stops the sandbox (your languages stay installed).\n");
const app = spawn(npm, ["run", dev ? "dev" : "start"], { cwd: ROOT, stdio: "inherit", shell: windows });
app.on("exit", (code) => process.exit(code ?? 0));
