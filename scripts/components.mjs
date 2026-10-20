#!/usr/bin/env node
// Add and remove the parts of Hack University on this computer, and see how
// much disk each one takes (lib/components.json):
//
//   npm run status                       # what's installed, what isn't, and the sizes
//   npm run add -- cpp spring            # install these (shows the size and asks first)
//   npm run remove -- go-api             # remove these (shows what that frees and asks first)
//   npm run remove -- go-api --dry-run   # only show what would go
//   npm run remove -- compilers --with-sandbox   # every compiler, and the sandbox they run in
//   npm run choose                       # the checklist npm run up shows on a first run
//   npm run clean                        # free Docker's build cache and older builds
//
// Names are the ids npm run status lists, a course (react, nextjs), a group
// (compilers, courses), or all. --yes answers yes to every question.
import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  CATALOG,
  COMPONENTS,
  GROUPS,
  and,
  component,
  detect,
  formatMB,
  freeMB,
  heldBy,
  install,
  remove,
  removePlan,
  resolveNames,
  saveChoice,
  savedChoice,
  shortName,
  sizeMB,
  uses,
} from "./lib/components.mjs";
import { chooseComponents, confirm } from "./lib/picker.mjs";
import { ROOT } from "./lib/servers.mjs";

const ESC = "\u001b[";
const bold = (s) => `${ESC}1m${s}${ESC}22m`;
const dim = (s) => `${ESC}2m${s}${ESC}22m`;
const good = (s) => `${ESC}32m${s}${ESC}39m`;
const warnc = (s) => `${ESC}33m${s}${ESC}39m`;

const argv = process.argv.slice(2);
const command = argv[0] && !argv[0].startsWith("-") ? argv.shift() : "status";
const yes = argv.includes("--yes") || argv.includes("-y");
const dryRun = argv.includes("--dry-run");
const names = argv.filter((a) => !a.startsWith("-"));

function fail(message) {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

function namedIds() {
  const { ids, unknown } = resolveNames(names);
  if (unknown.length) fail(`There's nothing named ${unknown.join(", ")}. npm run status lists the names.`);
  if (!ids.length) fail(`Name what to ${command}, like: npm run ${command} -- cpp`);
  return ids;
}

const list = (ids) => and(ids.map(shortName));

async function detectWithDocker() {
  const state = await detect();
  if (!state.docker) fail("Docker isn't running, and everything past the app runs in it. Start Docker Desktop, then try again.");
  return state;
}

// --- status ------------------------------------------------------------------------
async function status() {
  const state = await detect();
  const installed = [...state.installed];
  const width = Math.max(...COMPONENTS.map((c) => c.label.length + c.id.length + 3)) + 2;
  console.log(`\n${bold("Hack University on this computer")}\n`);
  console.log(`  ${good("●")} ${CATALOG.app.label.padEnd(width)}${formatMB(CATALOG.app.mb).padStart(8)}  ${dim(CATALOG.app.detail)}`);
  for (const g of GROUPS) {
    console.log(`\n  ${dim(g.label.toUpperCase())}`);
    for (const c of COMPONENTS.filter((x) => x.group === g.id)) {
      const name = `${c.label} ${dim(`(${c.id})`)}`.padEnd(width + dim("").length);
      if (c.piston && state.stopped) {
        console.log(`  ${dim("?")} ${name}${formatMB(c.mb).padStart(8)}  ${dim("the compiler sandbox is stopped: npm run piston:up")}`);
      } else if (state.installed.has(c.id)) {
        const plan = removePlan([c.id], installed);
        const by = heldBy(c.id, installed);
        const note = by.length ? `installed ${dim(`(${and(by)} ${uses(by)} the same parts)`)}` : "installed";
        console.log(`  ${good("●")} ${name}${formatMB(plan.mb + plan.caches).padStart(8)}  ${note}`);
      } else {
        const adds = sizeMB([...installed, c.id]) - sizeMB(installed);
        console.log(`  ${dim("○")} ${name}${formatMB(adds).padStart(8)}  ${dim(`npm run add -- ${c.id}`)}`);
      }
    }
  }
  console.log(`\n  ${bold(`About ${formatMB(CATALOG.app.mb + sizeMB(installed))} installed`)}, the app included.`);
  console.log(`  ${dim("Next to ● is what removing it frees, and next to ○ what adding it takes. Parts shared")}`);
  console.log(`  ${dim("by several (the compiler sandbox, the Node image, PostgreSQL) are counted once.")}`);
  if (!state.docker) console.log(`  ${warnc("Docker isn't running, so only the app is here to check. Start Docker Desktop to see the rest.")}`);
  else {
    const df = spawnSync("docker", ["system", "df", "--format", "{{.Type}}\t{{.Size}}\t{{.Reclaimable}}"], { encoding: "utf8" });
    const cache = String(df.stdout ?? "").split("\n").map((l) => l.split("\t")).find((r) => r[0] === "Build Cache");
    if (cache && cache[1] !== "0B") console.log(`  ${dim(`Docker's build cache holds ${cache[1]} more, and npm run clean frees the ${cache[2].split(" ")[0]} of it that's unused.`)}`);
  }
  const free = freeMB();
  if (free !== null) console.log(`  ${dim(`${formatMB(free)} free on this disk.`)}`);
  console.log(`\n  ${dim("npm run add -- <name>   npm run remove -- <name>   npm run choose")}\n`);
}

// --- add ------------------------------------------------------------------------------
async function add(ids) {
  const state = await detectWithDocker();
  const missing = ids.filter((id) => !state.installed.has(id));
  if (!missing.length) {
    console.log(`\n${good("✓")} Already installed: ${list(ids)}.`);
    return;
  }
  const have = [...state.installed];
  const download = sizeMB([...have, ...missing]) - sizeMB(have);
  console.log(`\n${bold("Adding")} ${list(missing)}`);
  console.log(`  about ${bold(formatMB(download))} more on disk ${dim("(the parts already here aren't downloaded again)")}`);
  const free = freeMB();
  if (free !== null) console.log(`  ${dim(`${formatMB(free)} free on this disk`)}`);
  if (free !== null && download > free) fail(`That's more than this disk has free. Free some space, then try again.`);
  if (dryRun) return console.log(dim("  (a dry run: nothing changed)"));
  if (!yes && !(await confirm("Download and install?", true))) return console.log("Nothing changed.");
  const ok = install(missing);
  saveChoice([...new Set([...(savedChoice() ?? have), ...missing])]);
  if (!ok) fail("A step failed (see above). Fix that, then run the same command again: what finished is kept.");
  console.log(`\n${good("✓")} Added ${list(missing)}. Reload the app's page to use ${missing.length > 1 ? "them" : "it"}.`);
}

// --- remove -------------------------------------------------------------------------
async function removeIds(ids) {
  const state = await detectWithDocker();
  if (state.stopped && ids.some((id) => component(id).piston)) {
    fail("The compiler sandbox is stopped, so its languages can't be removed. Start it with npm run piston:up, then try again.");
  }
  const keep = [...state.installed];
  for (const id of ids.filter((x) => !state.installed.has(x))) console.log(`\n${component(id).label} isn't installed.`);
  // One whose parts all stay for something you keep can't free anything alone.
  const going = [];
  for (const id of ids.filter((x) => state.installed.has(x))) {
    const by = heldBy(id, keep.filter((k) => !ids.includes(k)));
    if (by.length) console.log(`\n${component(id).label} stays: ${and(by)} ${uses(by)} the same parts. Remove ${by.length > 1 ? "those" : "it"} too to free them.`);
    else going.push(id);
  }
  if (!going.length) return;

  // Taking the last compiler can take the compiler sandbox with it, with --with-sandbox.
  const lastCompiler = going.some((id) => component(id).piston) && !keep.some((id) => !going.includes(id) && component(id).piston);
  const plan = removePlan(going, keep, { sandbox: argv.includes("--with-sandbox") });

  console.log(`\n${bold("Removing")} ${list(going)}`);
  const deletes = [];
  if (plan.languages.length) deletes.push(`${and(plan.languages)} from the compiler sandbox`);
  if (plan.images.length) deletes.push(and(plan.images.map((i) => CATALOG.parts[`image-${i}`].label)));
  if (plan.databases.length) deletes.push(`the ${and(plan.databases.map((d) => (d === "postgres" ? "PostgreSQL" : "MongoDB")))} image${plan.databases.length > 1 ? "s" : ""} (your databases' data stays)`);
  if (plan.sandbox) deletes.push("the compiler sandbox, with its image and its languages' volume");
  for (const d of deletes) console.log(`  deletes ${d}`);
  for (const s of plan.shared) console.log(`  ${dim(`keeps ${s.part}: ${and(s.by)} ${uses(s.by)} it`)}`);
  if (lastCompiler && !plan.sandbox) console.log(`  ${dim(`keeps the compiler sandbox (${formatMB(CATALOG.parts.sandbox.mb)}): add --with-sandbox to remove it too`)}`);
  const courses = going.filter((id) => !component(id).piston && component(id).mb > 0).length;
  const caches = !plan.caches
    ? ""
    : courses > 1
      ? `, and their package caches (${formatMB(plan.caches)}) clear by themselves after 30 days unused`
      : `, and its package cache (${formatMB(plan.caches)}) clears by itself after 30 days unused`;
  console.log(`  frees about ${bold(formatMB(plan.mb))}${dim(caches)}`);
  if (dryRun) return console.log(dim("  (a dry run: nothing changed)"));
  if (!yes && !(await confirm("Remove?", false))) return console.log("Nothing changed.");
  const ok = remove(plan);
  saveChoice((savedChoice() ?? keep).filter((id) => !going.includes(id)));
  if (!ok) fail("A step failed (see above). Run the same command again to finish.");
  console.log(`\n${good("✓")} Removed ${list(going)}. npm run add -- ${going.join(" ")} brings ${going.length > 1 ? "them" : "it"} back.`);
}

// --- choose --------------------------------------------------------------------------
async function choose() {
  const state = await detectWithDocker();
  if (!process.stdin.isTTY || !process.stdout.isTTY) fail("npm run choose needs a terminal to show its checklist. Use npm run add and npm run remove instead.");
  const picked = await chooseComponents({ selected: new Set(savedChoice() ?? state.installed), installed: state.installed });
  if (!picked) return console.log("Nothing changed.");
  const adding = picked.filter((id) => !state.installed.has(id));
  const dropping = [...state.installed].filter((id) => !picked.includes(id));
  if (!adding.length && !dropping.length) {
    saveChoice(picked);
    return console.log(`${good("✓")} Nothing to change.`);
  }
  if (adding.length) {
    console.log(`\n${bold("Installing")} ${list(adding)}`);
    const ok = install(adding);
    saveChoice([...new Set([...(savedChoice() ?? [...state.installed]), ...adding])]);
    if (!ok) fail("A step failed (see above). Run npm run choose again to finish.");
  }
  if (dropping.length) await removeIds(dropping);
  console.log(`\n${good("✓")} Done. Reload the app's page to see the change.`);
}

// --- clean ---------------------------------------------------------------------------
async function clean() {
  await detectWithDocker();
  const out = (cmd, args) => String(spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8" }).stdout ?? "");
  const cache = out("docker", ["system", "df", "--format", "{{.Type}}|{{.Size}}|{{.Reclaimable}}"])
    .split("\n")
    .map((l) => l.split("|"))
    .find((r) => r[0] === "Build Cache");
  const older = [...out(process.execPath, [path.join("runner", "images.ts"), "status"]).matchAll(/\(kept: ([^)]+)\)/g)].flatMap((m) => m[1].split(", "));
  const untagged = out("docker", ["images", "--filter", "dangling=true", "--quiet"]).split("\n").filter(Boolean).length;
  const hasCache = cache && cache[1] !== "0B";
  if (!hasCache && !older.length && !untagged) return console.log(`\n${good("✓")} Nothing to free.`);

  console.log(`\n${bold("Docker's leftovers")}`);
  if (hasCache) {
    console.log(`  · its build cache: ${cache[2].split(" ")[0]} unused, of ${cache[1]}`);
    console.log(`    ${dim("It makes the next rebuild of an image faster, and it's every project's on this computer.")}`);
  }
  if (older.length) console.log(`  · the course images' older builds: ${older.join(", ")}`);
  if (untagged) console.log(`  · ${untagged} untagged image${untagged > 1 ? "s" : ""} nothing uses`);
  console.log(`  ${dim("Your installed parts, workspaces, and databases stay.")}`);
  if (dryRun) return console.log(dim("  (a dry run: nothing changed)"));
  if (!yes && !(await confirm("Free them?", true))) return console.log("Nothing changed.");
  if (older.length) spawnSync(process.execPath, [path.join("runner", "images.ts"), "prune"], { cwd: ROOT, stdio: "inherit" });
  if (hasCache) spawnSync("docker", ["builder", "prune", "--all", "--force"], { stdio: "inherit" });
  if (untagged) spawnSync("docker", ["image", "prune", "--force"], { stdio: "inherit" });
  console.log(`\n${good("✓")} Done.`);
}

switch (command) {
  case "status":
    await status();
    break;
  case "add":
    await add(namedIds());
    break;
  case "remove":
    await removeIds(namedIds());
    break;
  case "choose":
    await choose();
    break;
  case "clean":
    await clean();
    break;
  default:
    fail(`There's no command ${command}. They are status, add, remove, choose, and clean.`);
}
