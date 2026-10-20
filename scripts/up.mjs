#!/usr/bin/env node
// One command from a fresh clone to a running app:
//
//   npm run up                      # set up whatever's missing, then serve the app
//   npm run up -- --dev             # the same, then the dev servers instead
//   npm run up -- --choose          # pick again what to install (the first run asks)
//   npm run up -- --all             # install every compiler and course (about 16 GB)
//   npm run up -- --minimal         # just the app: lessons, cheatsheets, SQL, search
//   npm run up -- --only=python,web # exactly these (npm run status lists the names)
//   npm run up -- --stacks=express  # also install these courses
//   npm run up -- --no-images       # skip building the course images this time
//
// Each step is skipped when it's already done, so running it again is quick:
//
//   1. Checks for Node 24.12+ and looks for Docker. Without Docker it says what
//      still works and carries on.
//   2. Asks what to install, the first time: a checklist of the compilers and
//      courses with each one's size, the total, and the free disk. The choice
//      is kept in ~/.hack-university/components.json, and npm run add, npm run
//      remove, and npm run choose change it later (lib/components.json has
//      the sizes).
//   3. npm install, when node_modules is missing or out of date, and the
//      workspace runner's own dependencies (runner/).
//   4. Starts the compiler sandbox and installs the chosen languages that are
//      missing (a few minutes the first time).
//   5. Downloads the cheatsheet search's model (30 MB, once).
//   6. Makes ~/.hack-university, with a fresh token for the runner.
//   7. Builds the chosen courses' images and downloads their databases (1 to
//      3 minutes each the first time), and checks Docker's memory.
//   8. Builds the app, when its code changed since the last build.
//   9. Starts the workspace runner on 127.0.0.1:3100, and restarts it if it
//      crashes.
//  10. Serves the app on http://localhost:3000. Ctrl+C stops the app and the
//      runner, and npm run piston:down stops the sandbox.
//
// Only Node's own modules here: this runs before npm install has.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { belowFloor, formatGiB, MEMORY_FLOOR_BYTES, recommendMore } from "../lib/docker-memory.mjs";
import {
  CATALOG,
  COMPONENTS,
  and,
  component,
  defaults,
  detect,
  formatMB,
  freeMB,
  heldBy,
  installPlan,
  removePlan,
  resolveNames,
  saveChoice,
  savedChoice,
  shortName,
  sizeMB,
} from "./lib/components.mjs";
import { chooseComponents } from "./lib/picker.mjs";
import { ROOT, dataDir, freshToken, portBusy, serveApp, stopTogether, superviseRunner } from "./lib/servers.mjs";

const args = process.argv.slice(2);
const dev = args.includes("--dev");
const noImages = args.includes("--no-images");
const stacksArg = args.find((a) => a.startsWith("--stacks="))?.slice("--stacks=".length);
const onlyArg = args.find((a) => a.startsWith("--only="))?.slice("--only=".length);
const pickAgain = args.includes("--choose");
const everything = args.includes("--all");
const minimal = args.includes("--minimal");
// next start and next dev listen on PORT too.
const PORT = Number(process.env.PORT) || 3000;
const RUNNER_PORT = Number(process.env.HU_RUNNER_PORT) || 3100;
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

// --stacks names courses (or all of them) to install on top of the choice,
// and --only names exactly what to install.
const COURSES = JSON.parse(readFileSync(path.join(ROOT, "content", "courses.json"), "utf8"))
  .courses.filter((c) => c.runtime.startsWith("runner:") || c.runtime === "browser")
  .map((c) => c.slug);
function named(list, flag) {
  const { ids, unknown } = resolveNames(list.split(",").map((s) => s.trim()).filter(Boolean));
  if (unknown.length) fail(`${flag} names ${unknown.join(", ")}, which isn't one of these: ${COMPONENTS.map((c) => c.id).join(", ")}.`);
  return ids;
}
const stackIds = stacksArg === undefined ? [] : named(stacksArg === "all" ? COURSES.join(",") : stacksArg, "--stacks");
const onlyIds = onlyArg === undefined ? null : named(onlyArg, "--only");

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

// 2. What to install -------------------------------------------------------------
// The flags decide, else the choice from last time, else what an install from
// before there was a choice has (kept, without asking), else the checklist.
// Without a terminal to show it in, the compilers.
step("Choosing what to install");
const state = docker ? await detect() : { docker: false, stopped: false, installed: new Set() };
let chosen = everything ? COMPONENTS.map((c) => c.id) : minimal ? [] : onlyIds;
const saved = savedChoice();
let fromChecklist = false;
if (!chosen && !pickAgain) chosen = saved ?? (state.installed.size ? [...state.installed] : null);
if (!chosen) {
  const picked = await chooseComponents({
    selected: new Set(saved ?? (state.installed.size ? state.installed : defaults())),
    installed: state.installed,
    intro: saved ? "" : "The app always comes. The rest runs code, and you can add or remove it later.",
  });
  fromChecklist = !!picked;
  if (picked) chosen = picked;
  else if (process.stdin.isTTY && process.stdout.isTTY) {
    console.log("   Stopped before installing anything. Run npm run up again to choose.");
    process.exit(0);
  } else {
    chosen = saved ?? defaults();
    console.log("   · No terminal to show the checklist in, so it's the compilers. npm run choose changes that.");
  }
}
chosen = [...new Set([...chosen, ...stackIds])];
saveChoice(chosen);
const plan = installPlan(chosen);
if (chosen.length) done(COMPONENTS.filter((c) => chosen.includes(c.id)).map((c) => c.label).join(", "));
else done(`just the app: ${CATALOG.app.detail}`);
{
  const total = CATALOG.app.mb + sizeMB(chosen);
  const have = chosen.filter((id) => state.installed.has(id) || (state.stopped && component(id).piston));
  const download = sizeMB(chosen) - sizeMB(have);
  const free = freeMB();
  const parts = [`about ${formatMB(total)} with the app`];
  if (download > 0) parts.push(`${formatMB(download)} of it to download now`);
  if (free !== null) parts.push(`${formatMB(free)} free`);
  console.log(`     ${parts.join(", ")}`);
  // What you unticked in the checklist goes now (npm run remove asks first).
  // What a flag left out stays until it's removed.
  const dropped = [...state.installed].filter((id) => !chosen.includes(id) && !heldBy(id, chosen).length);
  if (dropped.length && fromChecklist) {
    run(process.execPath, [path.join("scripts", "components.mjs"), "remove", ...dropped]);
  } else if (dropped.length) {
    const mb = removePlan(dropped, [...state.installed]).mb;
    console.log(
      dropped.length > 3
        ? `     ${dropped.length} compilers and courses you didn't choose are still here (about ${formatMB(mb)}). npm run choose removes them.`
        : `     ${and(dropped.map(shortName))}, which you didn't choose, ${dropped.length > 1 ? "are" : "is"} still here (about ${formatMB(mb)}). npm run remove -- ${dropped.join(" ")} frees that.`
    );
  }
  console.log("     npm run add -- <name>, npm run remove -- <name>, or npm run choose changes this later");
  if (free !== null && download > free) {
    fail(`That's more than this disk has free. Free some space, or choose less with npm run up -- --choose.`);
  }
}

// 3. Dependencies -------------------------------------------------------------
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

// 4. The compiler sandbox and its languages ---------------------------------------
step("Starting the compiler sandbox and its languages");
if (!plan.languages.length) {
  done("no compilers chosen, so it's skipped (npm run add -- python adds one)");
} else if (docker) {
  npmRun("run", "--silent", "piston:up");
  npmRun("run", "--silent", "piston:install", "--", ...plan.languages);
} else {
  warn("skipped until Docker runs (then run npm run up again)");
}

// 5. The search model -----------------------------------------------------------
step("Getting the cheatsheet search model");
npmRun("run", "--silent", "search:setup");

// 6. The runner's data folder and token ------------------------------------------
step("Preparing ~/.hack-university");
const data = dataDir();
const token = freshToken(data);
done(`${data} (your workspaces and the runner's log live here, outside the repo)`);

// 7. The course images and databases, and Docker's memory -----------------------
step("Building the course images");
if (!plan.images.length && !plan.databases.length) {
  done("nothing chosen needs one, so it's skipped");
} else if (!docker) {
  warn("skipped until Docker runs");
} else if (noImages) {
  warn("skipped (--no-images). The next npm run up builds them");
} else {
  if (plan.images.length) {
    const r = run(process.execPath, [path.join("runner", "images.ts"), "build", ...plan.images]);
    if (r.status !== 0) fail("Building the images failed (see above). Fix that, then run npm run up again, or skip them with --no-images.");
  }
  if (plan.databases.length) {
    const r = run(process.execPath, [path.join("runner", "db", "pull.ts"), ...plan.databases]);
    if (r.status !== 0) fail("Downloading the databases failed (see above). Fix that, then run npm run up again, or skip them with --no-images.");
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

// 8. The build ------------------------------------------------------------------
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

// 9. The workspace runner -----------------------------------------------------------
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

// 10. Serve ---------------------------------------------------------------------
if (await portBusy(PORT)) {
  await runner.stop();
  fail(`Something is already using port ${PORT}. If it's this app, it's up at http://localhost:${PORT}. Otherwise stop it, then run npm run up again.`);
}
console.log(`\n\u001b[1mHack University is starting on http://localhost:${PORT}\u001b[0m${dev ? " (dev servers)" : ""}`);
console.log("Ctrl+C stops it and the workspace runner. npm run piston:down stops the sandbox (your languages stay installed).\n");
stopTogether(serveApp({ dev, port: PORT, runnerPort: RUNNER_PORT, token }), runner);
