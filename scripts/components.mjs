#!/usr/bin/env node
// Add and remove the parts of Hack University on this computer, and see how
// much disk each one takes (lib/components.json):
//
//   npm run status                       # what's installed, what isn't, and the sizes
//   npm run add -- cpp bash              # install these (shows the size and asks first)
//   npm run remove -- go                 # remove these (shows what that frees and asks first)
//   npm run remove -- go --dry-run       # only show what would go
//   npm run remove -- compilers --with-sandbox   # every compiler, and the sandbox they run in
//   npm run choose                       # the checklist npm run up shows on a first run
//   npm run clean                        # free Docker's build cache, older builds, and what
//                                        # the project courses used to install
//   npm run clean -- --dry-run           # only show what would go
//   npm run uninstall                    # remove everything it installed (asks about your own work)
//   npm run uninstall -- --dry-run       # only show what would go
//
// Names are the ids npm run status lists, the group (compilers), or all. A
// project course (react, spring) needs nothing installed, and says so.
// --yes answers yes to every question (but those about deleting your own
// work, which take --delete-my-work). Docker Desktop starts by itself for the
// ones that need Docker.
import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import os from "node:os";
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
  projectCourseNote,
  remove,
  removePlan,
  resolveNames,
  saveChoice,
  savedChoice,
  shortName,
  sizeMB,
  uses,
} from "./lib/components.mjs";
import { dockerAnswers, startDockerDesktop } from "./lib/docker-desktop.mjs";
import { chooseComponents, confirm } from "./lib/picker.mjs";
import { dataFolder, describeRetired, findRetired, folderNames, hasLeftovers, removeRetired } from "./lib/retired.mjs";
import { ROOT, portBusy } from "./lib/servers.mjs";

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
  const { ids, unknown, courses } = resolveNames(names);
  if (unknown.length) fail(`There's nothing named ${unknown.join(", ")}. npm run status lists the names.`);
  if (courses.length) console.log(`\n${projectCourseNote(courses)}`);
  if (!ids.length && courses.length) process.exit(0);
  if (!ids.length) fail(`Name what to ${command}, like: npm run ${command} -- cpp`);
  return ids;
}

const list = (ids) => and(ids.map(shortName));

async function detectWithDocker() {
  let state = await detect();
  if (!state.docker && (await startDockerDesktop((t) => console.log(dim(t))))) state = await detect();
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
        console.log(`  ${good("●")} ${name}${formatMB(plan.mb).padStart(8)}  ${note}`);
      } else {
        const adds = sizeMB([...installed, c.id]) - sizeMB(installed);
        console.log(`  ${dim("○")} ${name}${formatMB(adds).padStart(8)}  ${dim(`npm run add -- ${c.id}`)}`);
      }
    }
  }
  console.log(`\n  ${bold(`About ${formatMB(CATALOG.app.mb + sizeMB(installed))} installed`)}, the app included.`);
  console.log(`  ${dim("Next to ● is what removing it frees, and next to ○ what adding it takes. The compiler")}`);
  console.log(`  ${dim("sandbox, which every language in it shares, is counted once.")}`);
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
  if (plan.sandbox) deletes.push("the compiler sandbox, with its image and its languages' volume");
  for (const d of deletes) console.log(`  deletes ${d}`);
  for (const s of plan.shared) console.log(`  ${dim(`keeps ${s.part}: ${and(s.by)} ${uses(s.by)} it`)}`);
  if (lastCompiler && !plan.sandbox) console.log(`  ${dim(`keeps the compiler sandbox (${formatMB(CATALOG.parts.sandbox.mb)}): add --with-sandbox to remove it too`)}`);
  console.log(`  frees about ${bold(formatMB(plan.mb))}`);
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
// Docker's build cache, the images' older builds and untagged images, and
// what the project courses used to install, which this version no longer
// uses (scripts/lib/retired.mjs). What of that is your own work (the course
// databases' data, and the folders of workspaces that are gone) gets a
// question of its own, and stays unless you say yes to it.
async function clean() {
  const hasDocker = !spawnSync("docker", ["--version"], { stdio: "ignore" }).error;
  let docker = hasDocker && dockerAnswers();
  if (hasDocker && !docker) docker = await startDockerDesktop((t) => console.log(dim(t)));
  const out = (cmd, args) => String(spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8" }).stdout ?? "");
  const cache = docker
    ? out("docker", ["system", "df", "--format", "{{.Type}}|{{.Size}}|{{.Reclaimable}}"])
        .split("\n")
        .map((l) => l.split("|"))
        .find((r) => r[0] === "Build Cache")
    : null;
  const older = docker ? [...out(process.execPath, [path.join("runner", "images.ts"), "status"]).matchAll(/\(kept: ([^)]+)\)/g)].flatMap((m) => m[1].split(", ")) : [];
  const untagged = docker ? out("docker", ["images", "--filter", "dangling=true", "--quiet"]).split("\n").filter(Boolean).length : 0;
  const hasCache = cache && cache[1] !== "0B";
  const retired = findRetired({ withDocker: Boolean(docker) });
  const leftovers = hasLeftovers(retired);
  const disk = hasCache || older.length > 0 || untagged > 0 || leftovers;
  const askData = retired.databases.length > 0;
  const askFolders = retired.folders.length > 0;
  if (!docker) console.log(`\n${warnc("Docker isn't running, so only what's outside it is looked at. Start Docker Desktop to free the rest.")}`);
  if (!disk && !askData && !askFolders) return console.log(`\n${good("✓")} Nothing to free.`);

  if (hasCache || older.length || untagged) {
    console.log(`\n${bold("Docker's leftovers")}`);
    if (hasCache) {
      console.log(`  · its build cache: ${cache[2].split(" ")[0]} unused, of ${cache[1]}`);
      console.log(`    ${dim("It makes the next rebuild of an image faster, and it's every project's on this computer.")}`);
    }
    if (older.length) console.log(`  · the TypeScript and Bash images' older builds: ${older.join(", ")}`);
    if (untagged) console.log(`  · ${untagged} untagged image${untagged > 1 ? "s" : ""} nothing uses`);
  }
  if (leftovers) {
    console.log(`\n${bold("What the project courses used to install")} ${dim("(they're read lessons now, with nothing to install)")}`);
    for (const line of describeRetired(retired)) console.log(`  · ${line}`);
  }
  if (askData || askFolders) {
    console.log(`\n${bold("Your own work from them")} ${dim("(each asked about on its own, and kept unless you say yes)")}`);
    if (askData) console.log(`  · the course databases' data (${retired.databases.join(", ")})`);
    if (askFolders) {
      const n = retired.folders.length;
      console.log(`  · ${n} folder${n > 1 ? "s" : ""} of workspaces that are gone, in ${path.join(dataFolder(), "workspaces")}: ${folderNames(retired.folders)}`);
    }
  }
  console.log(`  ${dim("Your installed parts, the compilers' folders, and the playground stay.")}`);
  if (dryRun) return console.log(dim("  (a dry run: nothing changed)"));
  const freeing = disk && (yes || (await confirm("Free them?", true)));
  // Your own work: never on --yes alone.
  const mine = argv.includes("--delete-my-work");
  const databases = askData && (mine || (!yes && (await confirm("Also delete the course databases' data? It can't be undone.", false))));
  const n = retired.folders.length;
  const folders = askFolders && (mine || (!yes && (await confirm(`Also delete the ${n} old workspace folder${n > 1 ? "s" : ""}? ${n > 1 ? "They" : "It"} can't be brought back.`, false))));
  if (!freeing && !databases && !folders) return console.log("Nothing changed.");
  const step = (what, ok) => console.log(ok ? `  ${good("✓")} ${what}` : `  ${warnc("!")} couldn't remove ${what} (see above)`);
  if (freeing && older.length) spawnSync(process.execPath, [path.join("runner", "images.ts"), "prune"], { cwd: ROOT, stdio: "inherit" });
  if (freeing && hasCache) spawnSync("docker", ["builder", "prune", "--all", "--force"], { stdio: "inherit" });
  if (freeing && untagged) spawnSync("docker", ["image", "prune", "--force"], { stdio: "inherit" });
  removeRetired(retired, { leftovers: freeing && leftovers, databases, folders, step });
  console.log(`\n${good("✓")} Done.`);
}

// --- uninstall -----------------------------------------------------------------------
// Everything npm run up put on this computer outside this folder: the
// compilers, and every container, volume, and network the workspace runner
// made (labeled hu.managed), with what the project courses used to install
// (scripts/lib/retired.mjs). Your own work (your folders and terminals' files
// in ~/.hack-university, and the course databases' data from before) stays
// unless you say to delete it too. This folder goes last, by hand: the
// running script can't delete the folder it runs from.
async function uninstall() {
  const hasDocker = !spawnSync("docker", ["--version"], { stdio: "ignore" }).error;
  let docker = hasDocker && dockerAnswers();
  if (hasDocker && !docker) docker = await startDockerDesktop((t) => console.log(dim(t)));
  if (hasDocker && !docker) fail("Docker isn't running, and most of what's to remove is in it. Start Docker Desktop, then run npm run uninstall again.");

  const lines = (args) => String(spawnSync("docker", args, { encoding: "utf8" }).stdout ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const plan = { containers: [], sandbox: false, images: [], dbImages: [], caches: [], work: [], networks: [] };
  let installed = [];
  if (docker) {
    installed = [...(await detect()).installed];
    plan.containers = lines(["ps", "--all", "--quiet", "--filter", "label=hu.managed=1"]);
    plan.sandbox = lines(["ps", "--all", "--quiet", "--filter", "name=^hu-piston$"]).length > 0 || lines(["volume", "ls", "--quiet", "--filter", "name=^hack-university-compiler_piston-packages$"]).length > 0;
    plan.images = lines(["images", "--format", "{{.Repository}}:{{.Tag}}", "--filter", "reference=hu/*"]);
    // What the project courses used to install that isn't labeled: the
    // databases' images, and Go's build cache when Docker made it.
    const retired = findRetired();
    plan.dbImages = retired.dbImages.map((i) => i.ref);
    for (const row of lines(["volume", "ls", "--filter", "label=hu.managed=1", "--format", "{{.Name}}\t{{.Labels}}"])) {
      const [name, labels = ""] = row.split("\t");
      // The course databases' data is your work. A workspace's own volumes
      // (its home and packages) never held your files, which are folders.
      (/(^|,)hu\.kind=db(,|$)/.test(labels) ? plan.work : plan.caches).push(name);
    }
    for (const name of retired.caches) if (!plan.caches.includes(name)) plan.caches.push(name);
    plan.networks = lines(["network", "ls", "--quiet", "--filter", "label=hu.managed=1"]);
  }
  // Looked at, never made: a dry run changes nothing.
  const data = process.env.HU_DATA_DIR || path.join(os.homedir(), ".hack-university");
  const hasData = existsSync(data);
  const socket = process.env.HU_TMUX_SOCKET || "hack-university";
  const sessions = spawnSync("tmux", ["-L", socket, "has-session"], { stdio: "ignore" });
  const tmux = !sessions.error && sessions.status === 0;

  console.log(`\n${bold("Uninstalling Hack University")}`);
  if (!hasDocker) console.log(`  ${dim("Docker isn't on this computer, so there's nothing in it to remove.")}`);
  const goes = [];
  if (installed.length) goes.push(`${list(installed)} (about ${formatMB(sizeMB(installed))})`);
  if (plan.sandbox) goes.push("the compiler sandbox, with its languages");
  if (plan.images.length) goes.push(`${plan.images.length} image${plan.images.length > 1 ? "s" : ""} the runner built (${and([...new Set(plan.images.map((i) => i.slice(0, i.lastIndexOf(":"))))])})`);
  if (plan.dbImages.length) goes.push("the course databases' images, from before");
  if (plan.containers.length) goes.push(`${plan.containers.length} container${plan.containers.length > 1 ? "s" : ""} the runner made`);
  if (plan.caches.length) goes.push(`the project courses' package caches and volumes, from before (${plan.caches.length})`);
  if (tmux) goes.push("the terminals' shells, and whatever runs in them");
  for (const g of goes) console.log(`  removes ${g}`);
  if (!goes.length) console.log(`  ${dim("Nothing is installed in Docker.")}`);
  const work = [hasData ? data : "", plan.work.length ? "the course databases' data from before" : ""].filter(Boolean).join(", and ");
  if (work) console.log(`  ${dim(`keeps your own work, unless you say otherwise: ${work}`)}`);
  if (dryRun) return console.log(dim("  (a dry run: nothing changed)"));
  // Running, the app holds its containers and files.
  for (const port of [Number(process.env.PORT) || 3000, Number(process.env.HU_RUNNER_PORT) || 3100]) {
    if (await portBusy(port)) fail(`Something is running on port ${port}. If it's Hack University, stop it first (Ctrl+C in its window), then run npm run uninstall again.`);
  }
  if (!yes && !(await confirm("Remove all of that?", false))) return console.log("Nothing changed.");
  const deleteWork = Boolean(work) && (argv.includes("--delete-my-work") || (!yes && (await confirm(`Also delete your own work (${work})? It can't be undone.`, false))));

  const step = (what, ok) => console.log(ok ? `  ${good("✓")} ${what}` : `  ${warnc("!")} couldn't remove ${what} (see above)`);
  const quietly = (args) => !spawnSync("docker", args, { stdio: ["ignore", "ignore", "inherit"] }).status;
  if (tmux) step("the terminals' shells", !spawnSync("tmux", ["-L", socket, "kill-server"], { stdio: "ignore" }).status);
  if (plan.containers.length) step("the containers", quietly(["rm", "--force", ...plan.containers]));
  // The sandbox, its image, and the volume its languages lived in.
  if (plan.sandbox) step("the compiler sandbox", !spawnSync("docker", ["compose", "down", "--rmi", "all", "--volumes"], { cwd: ROOT, stdio: ["ignore", "ignore", "inherit"] }).status);
  if (plan.images.length) step("the runner's images", quietly(["rmi", "--force", ...plan.images]));
  if (plan.dbImages.length) step("the databases' images", quietly(["rmi", ...plan.dbImages]));
  const volumes = [...plan.caches, ...(deleteWork ? plan.work : [])];
  if (volumes.length) step("the volumes", quietly(["volume", "rm", "--force", ...volumes]));
  if (plan.networks.length) step("the networks", quietly(["network", "rm", ...plan.networks]));
  if (deleteWork && hasData) {
    try {
      rmSync(data, { recursive: true, force: true, maxRetries: 3 });
      step(data, true);
    } catch {
      step(data, false);
    }
  }

  const folder = path.basename(ROOT);
  console.log(`\n${good("✓")} Done. Last, delete this folder, ${bold(ROOT)}:`);
  console.log(process.platform === "win32" ? `  cd .. && rmdir /s /q ${folder}` : `  cd .. && rm -rf ${folder}`);
  console.log(`  ${dim("Docker Desktop, Node.js, and Git stay: uninstall them like any app if nothing else needs them.")}`);
  console.log(`  ${dim("Your progress and the compilers' code saved in the browser stay there until you clear localhost's site data.")}`);
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
  case "uninstall":
    await uninstall();
    break;
  default:
    fail(`There's no command ${command}. They are status, add, remove, choose, clean, and uninstall.`);
}
