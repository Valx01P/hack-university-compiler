#!/usr/bin/env node
// npm run dev: the workspace runner under node --watch (it restarts whenever
// its code changes) and next dev, side by side. npm run up -- --dev does the
// same after setting everything up, so use that the first time. Ctrl+C stops
// both.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { ROOT, dataDir, freshToken, npmCommand, portBusy, serveApp, stopTogether, superviseRunner } from "./lib/servers.mjs";

const PORT = Number(process.env.PORT) || 3000;
const RUNNER_PORT = Number(process.env.HU_RUNNER_PORT) || 3100;

if (!existsSync(path.join(ROOT, "runner", "node_modules"))) {
  console.log("Installing the workspace runner's dependencies (once)...");
  const [file, args, shell] = npmCommand(["ci", "--prefix", "runner", "--ignore-scripts", "--no-audit", "--no-fund"]);
  const r = spawnSync(file, args, { cwd: ROOT, stdio: "inherit", shell });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
// The file icons and the workspaces' starting trees the app builds from
// (.generated/). Change a template while next dev runs and run it again.
{
  const r = spawnSync(process.execPath, [path.join("scripts", "build-content.mjs")], { cwd: ROOT, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
for (const [port, what] of [
  [RUNNER_PORT, "the workspace runner (HU_RUNNER_PORT)"],
  [PORT, "the app (PORT)"],
]) {
  if (await portBusy(port)) {
    console.error(`✗ Something is already using port ${port}, which ${what} needs. Stop it, or pick another port.`);
    process.exit(1);
  }
}

const token = freshToken(dataDir());
const runner = superviseRunner({ port: RUNNER_PORT, token, appPort: PORT, watch: true });
try {
  await runner.ready();
} catch (err) {
  await runner.stop();
  console.error(`✗ ${err.message}`);
  process.exit(1);
}
stopTogether(serveApp({ dev: true, port: PORT, runnerPort: RUNNER_PORT, token }), runner);
