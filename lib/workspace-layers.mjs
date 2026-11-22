// Workspace templates on disk (architecture §5.1, §6.6, §6.7): where a
// template and its layers live under content/, the checkpoint chains, and
// the starting tree a stack of layers makes. The runner copies the same
// layers into a workspace's folder when it first opens. This module only
// reads them, for the trees pages paint first (scripts/build-content.mjs
// writes them to .generated/, and server components read the same layers),
// so a workspace's explorer is there before anything answers.
//
//   content/workspaces/<course>/<template>/
//     template.json                 how it runs
//     base/**                       the golden codebase
//     checkpoints/<cp>/overlay/**   files a checkpoint adds or replaces
//     checkpoints/<cp>/delete.txt   paths it removes, one per line
//     checkpoints/<cp>/extends      the checkpoint it builds on (base when missing)
//     examples/<id>/overlay/**, delete.txt, transcript.json
//
// A layer is named the way the runner's PUT body names it: "base",
// "checkpoints/<cp>", "examples/<id>", or "@learn/<course>/<lesson>/
// part-<n>/<dir>" and "@challenges/<course>/<id>/<dir>" for overlays kept
// with a lesson or a challenge (their overlay/ when they have one, else the
// folder, whose delete.txt, transcript.json, and extends are notes about the
// overlay, not files in it), as the runner reads them (runner/README.md).
// Plain JavaScript on node:fs, so the build script and the server share it.
// Every path is content read where it lies, so the build never traces it.

import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { compareNames } from "./file-order.mjs";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// The notes an overlay folder may hold beside its files.
const NOTES = new Set(["delete.txt", "transcript.json", "extends"]);
// Never part of a workspace, wherever they turn up.
const SKIP = new Set([".DS_Store", ".git", "node_modules"]);

/** The folder every template lives under: content/workspaces, or
    WORKSPACES_CONTENT_DIR for drafts. */
export function workspacesRoot(root) {
  return process.env.WORKSPACES_CONTENT_DIR ? path.resolve(process.env.WORKSPACES_CONTENT_DIR) : path.join(/*turbopackIgnore: true*/ root, "content", "workspaces");
}

/** A template's folder, or null when there's no such template. */
export function templateDir(root, course, template) {
  if (!SLUG.test(course) || !SLUG.test(template)) return null;
  const dir = path.join(/*turbopackIgnore: true*/ workspacesRoot(root), course, template);
  return existsSync(path.join(/*turbopackIgnore: true*/ dir, "template.json")) ? dir : null;
}

/** A template's template.json, or null. */
export function readTemplate(root, course, template) {
  const dir = templateDir(root, course, template);
  if (!dir) return null;
  try {
    return JSON.parse(readFileSync(path.join(/*turbopackIgnore: true*/ dir, "template.json"), "utf8"));
  } catch {
    return null;
  }
}

/** Every template of a course, by id, in name order. */
export function listTemplates(root, course) {
  if (!SLUG.test(course)) return [];
  const dir = path.join(/*turbopackIgnore: true*/ workspacesRoot(root), course);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => SLUG.test(name) && existsSync(path.join(/*turbopackIgnore: true*/ dir, name, "template.json")))
    .sort();
}

/** The layers that make a checkpoint, oldest first: base, then each
    checkpoint it extends, ending with itself. "base" (or nothing) is the
    golden codebase alone. */
export function checkpointLayers(root, course, template, checkpoint) {
  const dir = templateDir(root, course, template);
  if (!dir) throw new Error(`No template ${course}/${template}`);
  const chain = [];
  const seen = new Set();
  let cp = checkpoint && checkpoint !== "base" ? checkpoint : null;
  while (cp) {
    if (!SLUG.test(cp) || seen.has(cp)) throw new Error(`Bad checkpoint chain at ${cp} in ${course}/${template}`);
    const cpDir = path.join(/*turbopackIgnore: true*/ dir, "checkpoints", cp);
    if (!existsSync(cpDir)) throw new Error(`No checkpoint ${cp} in ${course}/${template}`);
    seen.add(cp);
    chain.unshift(`checkpoints/${cp}`);
    const parent = existsSync(path.join(/*turbopackIgnore: true*/ cpDir, "extends")) ? readFileSync(path.join(/*turbopackIgnore: true*/ cpDir, "extends"), "utf8").trim() : "base";
    cp = parent && parent !== "base" ? parent : null;
  }
  return ["base", ...chain];
}

/** Where a layer's files are, and the paths it deletes. */
export function layerSource(root, course, template, layer) {
  const dir = templateDir(root, course, template);
  if (!dir) throw new Error(`No template ${course}/${template}`);
  const deletes = (file) =>
    existsSync(file)
      ? readFileSync(file, "utf8")
          .split("\n")
          .map((line) => line.trim().replace(/^\.\/+/, "").replace(/\/+$/, ""))
          .filter((line) => line && !line.startsWith("#"))
      : [];
  if (layer === "base") return { dir: path.join(/*turbopackIgnore: true*/ dir, "base"), deletes: [], notes: false };
  const kept = /^(checkpoints|examples)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(layer);
  if (kept) {
    const own = path.join(/*turbopackIgnore: true*/ dir, kept[1], kept[2]);
    return { dir: path.join(/*turbopackIgnore: true*/ own, "overlay"), deletes: deletes(path.join(/*turbopackIgnore: true*/ own, "delete.txt")), notes: false };
  }
  const outside = /^@(learn|challenges)\/((?:[a-z0-9]+(?:-[a-z0-9]+)*\/){2,3}[a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(layer);
  if (outside) {
    // Its overlay/ when it has one, else the folder itself, less its notes.
    // A lesson draft (LEARN_CONTENT_DIR) brings its own part folders.
    const parts = outside[2].split("/");
    const draft = outside[1] === "learn" && process.env.LEARN_CONTENT_DIR ? path.join(/*turbopackIgnore: true*/ path.resolve(process.env.LEARN_CONTENT_DIR), ...parts) : null;
    const own = draft && existsSync(draft) ? draft : path.join(/*turbopackIgnore: true*/ root, "content", outside[1], ...parts);
    const overlay = path.join(/*turbopackIgnore: true*/ own, "overlay");
    return { dir: existsSync(overlay) ? overlay : own, deletes: deletes(path.join(/*turbopackIgnore: true*/ own, "delete.txt")), notes: !existsSync(overlay) };
  }
  throw new Error(`Not a layer: ${layer}`);
}

const sha256 = (data) => createHash("sha256").update(data).digest("hex");

/**
 * The starting tree of a stack of layers: every file and folder, with its
 * size, permission bits, and SHA-256, keyed by path. Later layers replace
 * earlier ones, and each layer's deletions apply before its files. Symlinks,
 * FIFOs, and other special files are skipped (verify-templates refuses
 * them).
 */
export function layerTree(root, course, template, layers) {
  const tree = new Map();
  const remove = (p) => {
    for (const key of [...tree.keys()]) if (key === p || key.startsWith(`${p}/`)) tree.delete(key);
  };
  const addDirs = (p) => {
    const parts = p.split("/");
    for (let i = 1; i < parts.length; i++) {
      const dir = parts.slice(0, i).join("/");
      const at = tree.get(dir);
      if (!at || at.type !== "dir") tree.set(dir, { path: dir, type: "dir", mode: 0o755 });
    }
  };
  for (const layer of layers) {
    const { dir, deletes, notes } = layerSource(root, course, template, layer);
    for (const p of deletes) remove(p);
    if (!existsSync(dir)) continue;
    const walk = (rel) => {
      for (const name of readdirSync(path.join(/*turbopackIgnore: true*/ dir, rel)).sort()) {
        if (SKIP.has(name) || (notes && !rel && NOTES.has(name))) continue;
        const relPath = rel ? `${rel}/${name}` : name;
        const full = path.join(/*turbopackIgnore: true*/ dir, relPath);
        const stat = lstatSync(full);
        if (stat.isDirectory()) {
          const at = tree.get(relPath);
          if (at && at.type !== "dir") remove(relPath);
          addDirs(relPath);
          tree.set(relPath, { path: relPath, type: "dir", mode: stat.mode & 0o777 });
          walk(relPath);
        } else if (stat.isFile()) {
          const at = tree.get(relPath);
          if (at && at.type === "dir") remove(relPath);
          addDirs(relPath);
          const data = readFileSync(full);
          tree.set(relPath, { path: relPath, type: "file", size: data.length, mode: stat.mode & 0o777, sha256: sha256(data) });
        }
      }
    };
    walk("");
  }
  return tree;
}

/** A tree's entries in explorer order: folders first, then files, each by
    name, depth first. */
export function sortedEntries(tree) {
  const byParent = new Map();
  for (const entry of tree.values()) {
    const parent = entry.path.includes("/") ? entry.path.slice(0, entry.path.lastIndexOf("/")) : "";
    if (!byParent.has(parent)) byParent.set(parent, []);
    byParent.get(parent).push(entry);
  }
  const out = [];
  const visit = (parent) => {
    const kids = (byParent.get(parent) ?? []).sort(
      (a, b) => (a.type === "dir" ? 0 : 1) - (b.type === "dir" ? 0 : 1) || compareNames(a.path, b.path)
    );
    for (const kid of kids) {
      out.push(kid);
      if (kid.type === "dir") visit(kid.path);
    }
  };
  visit("");
  return out;
}

/** A short hash of a tree (path, mode, and contents of every entry), the
    same for the same starting point. */
export function treeHash(tree) {
  const lines = sortedEntries(tree).map((e) => `${e.path}\0${e.type}\0${e.mode}\0${e.sha256 ?? ""}`);
  return sha256(lines.join("\n")).slice(0, 12);
}
