#!/usr/bin/env node
// One command from a fresh clone to a running app:
//
//   npm run up                      # set up whatever's missing, then serve the app
//   npm run up -- --dev             # the same, then the dev servers instead
//   npm run up -- --stacks=all      # also prepare every course's sandbox now
//   npm run up -- --no-images       # skip building the sandbox images
//
// Each step is skipped when it's already done, so running it again is quick:
//
//   1. Checks for Node 24.12+ and looks for Docker. Without Docker it says what
//      still works and carries on.
//   2. npm install, when node_modules is missing or out of date, and the
//      workspace runner's own dependencies (runner/).
//   3. Starts the sandbox and installs any missing languages (about 5 GB the
//      first time, a few minutes).
//   4. Downloads the cheatsheet search's model (30 MB, once).
//   5. Makes ~/.hack-university, with a fresh token for the runner.
//   6. Builds the TypeScript and Bash sandboxes (hu/node and hu/bash, about
//      0.85 GB, 1 to 3 minutes the first time), and checks Docker's memory.
//   7. Builds the app, when its code changed since the last build.
//   8. Starts the workspace runner on 127.0.0.1:3100, and restarts it if it
//      crashes.
//   9. Serves the app on http://localhost:3000. Ctrl+C stops the app and the
//      runner, and npm run piston:down stops the sandbox.
//
// Only Node's own modules here: this runs before npm install has.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, statfsSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { belowFloor, formatGiB, MEMORY_FLOOR_BYTES, recommendMore } from "../lib/docker-memory.mjs";
import { ROOT, dataDir, freshToken, portBusy, serveApp, stopTogether, superviseRunner } from "./lib/servers.mjs";

const args = process.argv.slice(2);
const dev = args.includes("--dev");
const noImages = args.includes("--no-images");
const stacksArg = args.find((a) => a.startsWith("--stacks="))?.slice("--stacks=".length);
// next start and next dev listen on PORT too.
const PORT = Number(process.env.PORT) || 3000;
const RUNNER_PORT = Number(process.env.HU_RUNNER_PORT) || 3100;
const windows = process.platform === "win32";
const npm = windows ? "npm.cmd" : "npm";

let stepNo = 0;
const step = (text) => console.log(`\n\u001b[1m${++stepNo}. ${text}\u001b[0m`);
const done = (text) => console.log(`   ✓ ${text}`);
const warn = (text) => console.log(`   ! ${text}`);
function fail(message) {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}
function run(cmd, cmdArgs, { quiet = false } = {}) {
  return spawnSync(cmd, cmdArgs, { cwd: ROOT, stdio: quiet ? "pipe" : "inherit", shell: windows, encoding: "utf8" });
}
function npmRun(...npmArgs) {
  const r = run(npm, npmArgs);
  if (r.status !== 0) fail(`npm ${npmArgs.join(" ")} failed (see above). Fix that, then run npm run up again.`);
}

// The courses whose sandboxes exist so far, by the image each one runs on.
const STACKS = { typescript: "node", bash: "bash" };
const LATER_STACKS = ["web", "react", "nextjs", "express", "fastapi", "spring", "go-api"];
const stacks = stacksArg === "all" ? Object.keys(STACKS) : (stacksArg?.split(",").map((s) => s.trim()).filter(Boolean) ?? []);
for (const stack of stacks) {
  if (!STACKS[stack] && !LATER_STACKS.includes(stack)) {
    fail(`There is no course named ${stack}. The courses are: ${[...Object.keys(STACKS), ...LATER_STACKS].join(", ")}.`);
  }
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

let docker = null;
const info = run("docker", ["info", "--format", "{{json .}}"], { quiet: true });
if (info.error) {
  warn("Docker isn't installed, so code can't run yet. Get Docker Desktop from https://docs.docker.com/get-docker/.");
} else if (info.status !== 0) {
  warn("Docker isn't running, so code can't run yet. Start Docker Desktop, then run npm run up again.");
} else {
  try {
    docker = JSON.parse(info.stdout);
    done(`Docker ${docker.ServerVersion}, with ${formatGiB(docker.MemTotal)} of memory`);
  } catch {
    warn("Docker answered, but not in a way this script understands. Carrying on without it.");
  }
}
if (!docker) {
  console.log("     Until then, lessons, cheatsheets, search, your progress, and the SQL course all work.");
  console.log("     Running Python, JavaScript, C++, Java, Go, TypeScript, or Bash says to start Docker.");
}

// 2. Dependencies -------------------------------------------------------------
step("Installing dependencies");
const fresh = (dir) => {
  const lock = path.join(ROOT, dir, "package-lock.json");
  const installed = path.join(ROOT, dir, "node_modules", ".package-lock.json");
  return existsSync(installed) && statSync(installed).mtimeMs >= statSync(lock).mtimeMs;
};
if (fresh(".")) done("the app's: already installed");
else npmRun("install", "--no-audit", "--no-fund");
// The runner's own (dockerode, ws, zod), kept apart from the app's. Nothing
// it installs runs a script, so no native code gets built.
if (fresh("runner")) done("the runner's: already installed");
else npmRun("ci", "--prefix", "runner", "--ignore-scripts", "--no-audit", "--no-fund");

// 3. The sandbox and its languages -------------------------------------------
step("Starting the code sandbox and its languages");
if (docker) {
  npmRun("run", "--silent", "piston:up");
  npmRun("run", "--silent", "piston:install");
} else {
  warn("skipped until Docker runs (then run npm run up again)");
}

// 4. The search model -----------------------------------------------------------
step("Getting the cheatsheet search model");
npmRun("run", "--silent", "search:setup");

// 5. The runner's data folder and token ------------------------------------------
step("Preparing ~/.hack-university");
const data = dataDir();
const token = freshToken(data);
done(`${data} (your workspaces and the runner's log live here, outside the repo)`);

// 6. The sandbox images, and Docker's memory -----------------------------------
step("Building the TypeScript and Bash sandboxes");
if (!docker) {
  warn("skipped until Docker runs");
} else if (noImages) {
  warn("skipped (--no-images). Build them later with npm run images");
} else {
  const r = run(process.execPath, [path.join("runner", "images.ts"), "build", ...new Set(["node", "bash", ...stacks.map((s) => STACKS[s]).filter(Boolean)])]);
  if (r.status !== 0) fail("Building the sandbox images failed (see above). Fix that, then run npm run up again, or skip them with --no-images.");
  for (const stack of stacks.filter((s) => LATER_STACKS.includes(s))) {
    console.log(`   · ${stack}: its sandbox comes with the course, which offers Prepare this course`);
  }
}
if (docker) {
  const host = os.totalmem();
  if (belowFloor(docker.MemTotal)) {
    warn(`Docker has ${formatGiB(docker.MemTotal)} of memory, under the ${formatGiB(MEMORY_FLOOR_BYTES)} every course is tested with.`);
    warn("Spring Boot and Next.js workspaces may not start. Give Docker more in Docker Desktop: Settings > Resources > Memory.");
  } else if (recommendMore(docker.MemTotal, host)) {
    console.log(`   · This Mac has ${formatGiB(host)} and Docker has ${formatGiB(docker.MemTotal)}. Every course works as it is.`);
    console.log("     With 16 GiB (Docker Desktop: Settings > Resources > Memory), five Next.js workspaces run at once.");
    console.log("     https://docs.docker.com/desktop/settings-and-maintenance/settings/#resources");
  }
}
try {
  const disk = statfsSync(os.homedir());
  const free = disk.bavail * disk.bsize;
  if (free < 15e9) warn(`Only ${(free / 1e9).toFixed(1)} GB of disk is free. Each course's sandbox takes 0.5 to 3 GB when you first open it.`);
} catch {
  /* statfs isn't everywhere */
}

// 7. The build ------------------------------------------------------------------
// Rebuilt when any file the app is built from is newer than the last build,
// or when the runner's port changed (the app's CSP names it).
function newest(entry) {
  const full = path.join(ROOT, entry);
  if (!existsSync(full)) return 0;
  const stat = statSync(full);
  if (!stat.isDirectory()) return stat.mtimeMs;
  let latest = stat.mtimeMs;
  for (const name of readdirSync(full)) latest = Math.max(latest, newest(path.join(entry, name)));
  return latest;
}
if (existsSync(path.join(ROOT, "scripts", "build-content.mjs"))) {
  const r = run(process.execPath, [path.join("scripts", "build-content.mjs")]);
  if (r.status !== 0) fail("scripts/build-content.mjs failed (see above).");
}
if (!dev) {
  step("Building the app");
  const buildId = path.join(ROOT, ".next", "BUILD_ID");
  const portStamp = path.join(ROOT, ".next", "hu-runner-port");
  const sources = [
    "app", "components", "lib", "content", "public", "next.config.ts", "package-lock.json", "tsconfig.json", "postcss.config.mjs",
  ];
  const samePort = existsSync(portStamp) && readFileSync(portStamp, "utf8").trim() === String(RUNNER_PORT);
  if (existsSync(buildId) && samePort && Math.max(...sources.map(newest)) <= statSync(buildId).mtimeMs) done("up to date");
  else {
    npmRun("run", "build");
    mkdirSync(path.dirname(portStamp), { recursive: true });
    writeFileSync(portStamp, `${RUNNER_PORT}\n`);
  }
}

// 8. The workspace runner -----------------------------------------------------------
step("Starting the workspace runner");
if (await portBusy(RUNNER_PORT)) {
  fail(`Something is already using port ${RUNNER_PORT}, which the workspace runner needs. If it's an earlier npm run up, stop it first. Or set HU_RUNNER_PORT to another port.`);
}
const runner = superviseRunner({ port: RUNNER_PORT, token, appPort: PORT, watch: dev });
try {
  const health = await runner.ready();
  done(`on http://127.0.0.1:${RUNNER_PORT} (Docker ${health.docker.state === "ready" ? "ready" : health.docker.state})`);
} catch (err) {
  await runner.stop();
  fail(`${err.message} Its log is ${path.join(data, "logs", "runner.log")}.`);
}

// 9. Serve ----------------------------------------------------------------------
if (await portBusy(PORT)) {
  await runner.stop();
  fail(`Something is already using port ${PORT}. If it's this app, it's up at http://localhost:${PORT}. Otherwise stop it, then run npm run up again.`);
}
console.log(`\n\u001b[1mHack University is starting on http://localhost:${PORT}\u001b[0m${dev ? " (dev servers)" : ""}`);
console.log("Ctrl+C stops it and the workspace runner. npm run piston:down stops the sandbox (your languages stay installed).\n");
stopTogether(serveApp({ dev, port: PORT, runnerPort: RUNNER_PORT, token }), runner);
