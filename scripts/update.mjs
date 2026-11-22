#!/usr/bin/env node
// Gets the newest Hack University, then starts it the way npm run up does:
//
//   npm run update                # update, then start
//   npm run update -- --minimal   # flags go on to npm run up
//
// npm run up then does whatever the update needs: the new dependencies, the
// compilers you have in their new versions, and the build, and it says when
// something an older version installed is no longer used. Your code,
// progress, folders, and choice of what's installed are kept: they live in
// the browser and in ~/.hack-university, not in this folder. This is the
// only time Hack University goes online for itself, and only when you run
// it: the app never checks for updates.
// Only Node's own modules here: it runs before npm install.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ROOT, portBusy } from "./lib/servers.mjs";

const ESC = "\u001b[";
const bold = (s) => `${ESC}1m${s}${ESC}22m`;
const dim = (s) => `${ESC}2m${s}${ESC}22m`;
const good = (s) => `${ESC}32m${s}${ESC}39m`;
const PORT = Number(process.env.PORT) || 3000;
const RUNNER_PORT = Number(process.env.HU_RUNNER_PORT) || 3100;
/** Files npm or the scripts rewrite as they work, never anyone's changes. */
const GENERATED = ["package-lock.json", "runner/package-lock.json"];

function fail(message) {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}
const git = (...args) => spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
/** The compilers there are to choose from, by id and name. */
const catalog = () => new Map(JSON.parse(readFileSync(path.join(ROOT, "lib", "components.json"), "utf8")).components.map((c) => [c.id, c.label]));

console.log(`\n${bold("Updating Hack University")}`);
if (git("--version").error) fail("Git isn't installed, and updating needs it. Install it (the README's step 1), then run npm run update again.");
if (!existsSync(path.join(ROOT, ".git"))) {
  fail("This folder wasn't downloaded with git, so it can't update itself. Download it again with the README's steps: your work is kept, since it lives in your browser and in ~/.hack-university.");
}
// Rebuilt under a running app, the app would break until it restarts.
for (const port of [PORT, RUNNER_PORT]) {
  if (await portBusy(port)) fail(`Something is running on port ${port}. If it's Hack University, stop it first (Ctrl+C in its window), then run npm run update again.`);
}

// Only the app's own files can be in the way. Your work never is: it's not here.
const changed = git("status", "--porcelain", "--untracked-files=no").stdout.split("\n").filter(Boolean).map((line) => line.slice(3).trim());
const regenerated = changed.filter((f) => GENERATED.includes(f));
if (regenerated.length) git("checkout", "--", ...regenerated);
const edited = changed.filter((f) => !GENERATED.includes(f));
if (edited.length) {
  const shown = edited.slice(0, 5).join(", ") + (edited.length > 5 ? `, and ${edited.length - 5} more` : "");
  fail(`Some of the app's own files were changed here (${shown}), and updating would clash with that. Copy them somewhere if you want to keep the changes, then put the originals back with git checkout -- . and run npm run update again.`);
}

const before = git("rev-parse", "HEAD").stdout.trim();
const had = catalog();
console.log(dim("   Downloading the newest version…"));
const pull = spawnSync("git", ["pull", "--ff-only", "--quiet"], { cwd: ROOT, stdio: "inherit" });
if (pull.status !== 0) fail("Getting the newest version didn't work (see above). Check the internet connection, then run npm run update again.");
const after = git("rev-parse", "HEAD").stdout.trim();
if (before === after) console.log(`   ${good("✓")} Already the newest version`);
else {
  const count = Number(git("rev-list", "--count", `${before}..${after}`).stdout.trim()) || 0;
  console.log(`   ${good("✓")} Updated, with ${count} change${count === 1 ? "" : "s"}`);
  const added = [...catalog()].filter(([id]) => !had.has(id)).map(([, label]) => label);
  if (added.length) console.log(`   New to install: ${added.join(", ")}. ${bold("npm run choose")} adds ${added.length > 1 ? "them" : "it"}.`);
}

// The new npm run up, in a process of its own (this one has the old scripts
// loaded). Ctrl+C reaches both: this one waits for it to stop.
process.on("SIGINT", () => {});
const up = spawnSync(process.execPath, [path.join("scripts", "up.mjs"), ...process.argv.slice(2)], { cwd: ROOT, stdio: "inherit" });
process.exit(up.status ?? 1);
