#!/usr/bin/env node
// Writes what the app builds from content before next build (and before
// next dev), into .generated/ (git-ignored):
//
//   .generated/file-icons.css     the Material file icons the explorer and the
//                                 editor tabs use, as data: URI classes
//   .generated/file-icons.ts      the lookup from a file or folder name to
//                                 its icon, limited to those icons
//   .generated/workspaces/<course>/<template>/<checkpoint>.json
//                                 every template's starting trees (path,
//                                 type, size, mode, SHA-256), which the
//                                 explorer paints before the runner answers
//
// The icons come from material-icon-theme (the npm build of VS Code's
// Material Icon Theme): its prebuilt manifest is read as data, so none of
// the package's code runs. Only the icons the templates use, plus a list of
// common ones a learner may add, ship (about 150 icons, under 20 KB
// gzipped). Lookups follow VS Code's precedence: a file's whole name, then
// its extensions from the longest ("user.test.ts" tries "test.ts", then
// "ts"), then its language. Each icon is its own data: URI, so the SVGs'
// ids never collide, and the icons are there at first paint. A template
// file that would get the blank default icon fails the build.
//
// Usage: node scripts/build-content.mjs [--check]   (--check writes nothing)

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { checkpointLayers, layerTree, listTemplates, sortedEntries, treeHash, workspacesRoot } from "../lib/workspace-layers.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = path.join(ROOT, ".generated");
const check = process.argv.includes("--check");
const THEME = path.join(ROOT, "node_modules", "material-icon-theme");

// Names a learner may add, beyond what the templates hold, so a new file
// rarely shows the blank icon.
const COMMON_FILES = [
  "a.ts", "a.tsx", "a.mts", "a.cts", "a.d.ts", "a.test.ts", "a.spec.ts", "a.test.tsx", "a.js", "a.jsx", "a.mjs", "a.cjs",
  "a.test.js", "a.spec.js", "a.json", "a.jsonc", "a.md", "a.mdx", "a.txt", "a.css", "a.scss", "a.html", "a.svg", "a.png",
  "a.jpg", "a.jpeg", "a.gif", "a.webp", "a.ico", "a.avif", "a.sh", "a.bash", "a.zsh", "a.bats", "a.py", "a.pyi", "a.go",
  "a.java", "a.kt", "a.sql", "a.yml", "a.yaml", "a.toml", "a.xml", "a.ini", "a.env", "a.http", "a.rest", "a.lock", "a.log",
  "a.csv", "a.tsv", "a.pdf", "a.zip", "a.gz", "a.tar", "a.db", "a.sqlite", "a.c", "a.h", "a.cpp", "a.hpp", "a.rs", "a.rb",
  "a.php", "a.properties", "a.diff", "a.patch", "a.ejs", "a.vue", "a.svelte", "a.wasm", "a.pem", "a.key", "a.crt",
  "Dockerfile", "Makefile", ".gitignore", ".dockerignore", ".gitattributes", ".env", ".env.example", ".env.local",
  ".editorconfig", ".prettierrc", ".nvmrc", ".npmrc", "eslint.config.js", "eslint.config.mjs", "vite.config.ts",
  "vitest.config.ts", "next.config.ts", "package.json", "package-lock.json", "tsconfig.json", "tsconfig.build.json",
  "README.md", "LICENSE", "CHANGELOG.md", "go.mod", "go.sum", "pom.xml", "mvnw", "pyproject.toml", "uv.lock",
  "requirements.txt", "compose.yaml", "docker-compose.yml", "favicon.ico", "robots.txt", "requests.http", "openapi.yaml",
];
const COMMON_FOLDERS = [
  "src", "test", "tests", "__tests__", "lib", "dist", "build", "out", "node_modules", "public", "assets", "images", "img",
  "icons", "fonts", "components", "pages", "app", "api", "routes", "controllers", "controller", "handlers", "services",
  "service", "models", "model", "views", "middleware", "migrations", "db", "database", "config", "scripts", "docs", "data",
  "utils", "helpers", "hooks", "types", "typings", "internal", "cmd", "templates", "styles", "css", ".git", ".github",
  ".vscode", "target", "venv", ".venv", "tmp", "temp", "logs", "fixtures", "mocks", "__mocks__", "store", "dto", "entity",
  "entities", "domain", "repository", "repositories", "schemas", "schema", "core", "shared", "packages", "apps", "examples",
  "bin", "static", "client", "server", "seed", "seeds", "queries", "sql", "env", "secrets", "keys", "certs", "home",
];
// Folders the theme has no icon for, given the closest one (research ide.md §1.1).
const LOCAL_FOLDERS = { internal: "folder-private", dto: "folder-class", entity: "folder-class", entities: "folder-class", domain: "folder-class" };
// Whole names that are a language without an extension.
const LANGUAGE_OF = { dockerfile: "dockerfile", makefile: "makefile", gemfile: "ruby", rakefile: "ruby", jenkinsfile: "groovy" };

function readManifest() {
  const file = path.join(THEME, "dist", "material-icons.json");
  if (!existsSync(file)) throw new Error("material-icon-theme isn't installed. Run npm install first.");
  return JSON.parse(readFileSync(file, "utf8"));
}

/** VS Code's lookup: whole name, then the longest extension first, then the language. */
function fileIconName(manifest, name, light) {
  const n = name.toLowerCase();
  const pick = (key, k) => (light && manifest.light?.[key]?.[k]) || manifest[key]?.[k];
  const byName = pick("fileNames", n);
  if (byName) return byName;
  const parts = n.split(".");
  for (let i = 1; i < parts.length; i++) {
    const byExt = pick("fileExtensions", parts.slice(i).join("."));
    if (byExt) return byExt;
  }
  const lang = LANGUAGE_OF[n] ?? (parts.length > 1 ? parts[parts.length - 1] : null);
  return (lang && pick("languageIds", lang)) || null;
}

function folderIconName(manifest, name, open, light) {
  const n = name.toLowerCase();
  const key = open ? "folderNamesExpanded" : "folderNames";
  const own = (light && manifest.light?.[key]?.[n]) || manifest[key]?.[n];
  if (own) return own;
  const local = LOCAL_FOLDERS[n];
  return local ? (open ? `${local}-open` : local) : null;
}

/** Every file and folder name a learner can see in a workspace: each
    template's files in every layer, and the overlays kept with lessons and
    challenges. */
function workspaceNames() {
  const files = new Map();
  const folders = new Set();
  const add = (rel, isDir, where) => {
    const name = rel.slice(rel.lastIndexOf("/") + 1);
    if (isDir) folders.add(name);
    else if (!files.has(name)) files.set(name, where);
  };
  const walk = (dir, rel, where, skipTop = []) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      if (name === ".DS_Store" || (!rel && skipTop.includes(name))) continue;
      const full = path.join(dir, name);
      const relPath = rel ? `${rel}/${name}` : name;
      const isDir = statSync(full).isDirectory();
      add(relPath, isDir, `${where}/${relPath}`);
      if (isDir) walk(full, relPath, where);
    }
  };
  const root = workspacesRoot(ROOT);
  for (const course of existsSync(root) ? readdirSync(root) : []) {
    for (const template of listTemplates(ROOT, course)) {
      const dir = path.join(root, course, template);
      walk(path.join(dir, "base"), "", `${course}/${template}/base`);
      for (const kind of ["checkpoints", "examples"]) {
        const kindDir = path.join(dir, kind);
        for (const id of existsSync(kindDir) ? readdirSync(kindDir) : []) {
          walk(path.join(kindDir, id, "overlay"), "", `${course}/${template}/${kind}/${id}`);
        }
      }
    }
  }
  // Overlays kept with lessons (part-<n>/example-<k>, practice/starter,
  // practice/solution) and challenges (starter, solution).
  const learn = path.join(ROOT, "content", "learn");
  for (const course of existsSync(learn) ? readdirSync(learn) : []) {
    const courseDir = path.join(learn, course);
    if (!statSync(courseDir).isDirectory()) continue;
    for (const lesson of readdirSync(courseDir)) {
      const lessonDir = path.join(courseDir, lesson);
      if (!statSync(lessonDir).isDirectory()) continue;
      for (const part of readdirSync(lessonDir).filter((p) => /^part-\d+$/.test(p))) {
        for (const sub of readdirSync(path.join(lessonDir, part))) {
          const where = `learn/${course}/${lesson}/${part}/${sub}`;
          if (/^example-\d$/.test(sub)) walk(path.join(lessonDir, part, sub), "", where, ["delete.txt", "transcript.json", "checks.spec.ts"]);
          if (sub === "practice") {
            walk(path.join(lessonDir, part, sub, "starter"), "", `${where}/starter`, ["delete.txt"]);
            walk(path.join(lessonDir, part, sub, "solution"), "", `${where}/solution`, ["delete.txt"]);
          }
        }
      }
    }
  }
  const challenges = path.join(ROOT, "content", "challenges");
  for (const course of existsSync(challenges) ? readdirSync(challenges) : []) {
    const courseDir = path.join(challenges, course);
    if (!statSync(courseDir).isDirectory()) continue;
    for (const id of readdirSync(courseDir)) {
      for (const sub of ["starter", "solution"]) walk(path.join(courseDir, id, sub), "", `challenges/${course}/${id}/${sub}`, ["delete.txt"]);
    }
  }
  return { files, folders };
}

/** An SVG as a compact data: URI for CSS (quotes swapped, only the
    characters that must be escaped escaped). */
function svgUri(svg) {
  const body = svg
    .replace(/<\?xml[^>]*\?>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s+/g, " ")
    .replace(/> </g, "><")
    .trim()
    .replace(/"/g, "'")
    .replace(/%/g, "%25")
    .replace(/#/g, "%23")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E");
  return `url("data:image/svg+xml,${body}")`;
}

function buildIcons() {
  const manifest = readManifest();
  const { files, folders } = workspaceNames();
  const blank = [];
  for (const [name, where] of files) if (!fileIconName(manifest, name, false)) blank.push(where);
  // Like VS Code, a file no icon matches gets the plain file icon.
  if (blank.length) {
    console.warn(`  ${blank.length} workspace files get the plain file icon (no Material icon matches them), like ${blank.slice(0, 3).join(", ")}`);
  }

  // The tables, limited to the names we use.
  const table = { fileNames: {}, fileExtensions: {}, languageIds: {}, folderNames: {}, folderNamesExpanded: {} };
  const light = { fileNames: {}, fileExtensions: {}, languageIds: {}, folderNames: {}, folderNamesExpanded: {} };
  const used = new Set([manifest.file, manifest.folder, manifest.folderExpanded]);
  const keep = (key, k, darkName, lightName) => {
    if (darkName) {
      table[key][k] = darkName;
      used.add(darkName);
    }
    if (lightName && lightName !== darkName) {
      light[key][k] = lightName;
      used.add(lightName);
    }
  };
  // A file name's own entry, or each of its extensions, or its language.
  const fileKeys = (name) => {
    const n = name.toLowerCase();
    for (const key of ["fileNames"]) {
      if (manifest[key][n] || manifest.light?.[key]?.[n]) keep(key, n, manifest[key][n], manifest.light?.[key]?.[n]);
    }
    const parts = n.split(".");
    for (let i = 1; i < parts.length; i++) {
      const ext = parts.slice(i).join(".");
      if (manifest.fileExtensions[ext] || manifest.light?.fileExtensions?.[ext]) {
        keep("fileExtensions", ext, manifest.fileExtensions[ext], manifest.light?.fileExtensions?.[ext]);
      }
    }
    const lang = LANGUAGE_OF[n] ?? (parts.length > 1 ? parts[parts.length - 1] : null);
    if (lang && (manifest.languageIds[lang] || manifest.light?.languageIds?.[lang])) {
      keep("languageIds", lang, manifest.languageIds[lang], manifest.light?.languageIds?.[lang]);
    }
  };
  for (const name of [...files.keys(), ...COMMON_FILES]) fileKeys(name);
  for (const name of [...folders, ...COMMON_FOLDERS]) {
    const n = name.toLowerCase();
    for (const [key, open] of [["folderNames", false], ["folderNamesExpanded", true]]) {
      const dark = folderIconName(manifest, n, open, false);
      const lite = folderIconName(manifest, n, open, true);
      if (dark) keep(key, n, dark, lite);
    }
  }

  // One class per icon. A light page uses an icon's light variant where the
  // theme has one: the component sets both classes, and the light one wins
  // only without <html data-dark>, so the first paint is right either way.
  const lightIcons = new Set(Object.values(light).flatMap((m) => Object.values(m)));
  const css = [
    "/* Generated by scripts/build-content.mjs from material-icon-theme. Do not edit. */",
    ".fi{display:inline-block;flex-shrink:0;width:1rem;height:1rem;background:no-repeat center/contain}",
  ];
  let bytes = 0;
  for (const icon of [...used].sort()) {
    const def = manifest.iconDefinitions[icon];
    if (!def) throw new Error(`material-icon-theme has no icon named ${icon}`);
    const svg = readFileSync(path.join(THEME, "dist", def.iconPath), "utf8");
    const uri = svgUri(svg);
    bytes += uri.length;
    css.push(lightIcons.has(icon) ? `html:not([data-dark]) .fl-${icon}{background-image:${uri}}` : `.fi-${icon}{background-image:${uri}}`);
  }
  const ts = `// Generated by scripts/build-content.mjs from material-icon-theme ${JSON.parse(readFileSync(path.join(THEME, "package.json"), "utf8")).version}. Do not edit.
// The Material icon of each file and folder name the workspaces use, limited
// to the icons in .generated/file-icons.css. lib/file-icons.ts reads it.

export const ICONS = ${JSON.stringify(
    {
      file: manifest.file,
      folder: manifest.folder,
      folderExpanded: manifest.folderExpanded,
      ...table,
      languageOf: LANGUAGE_OF,
      light,
    },
    null,
    2
  )} as const;
`;
  return { css: `${css.join("\n")}\n`, ts, count: used.size, bytes };
}

function buildTrees() {
  const out = [];
  const root = workspacesRoot(ROOT);
  for (const course of existsSync(root) ? readdirSync(root).filter((c) => !c.startsWith(".")) : []) {
    for (const template of listTemplates(ROOT, course)) {
      const cpDir = path.join(root, course, template, "checkpoints");
      const checkpoints = ["base", ...(existsSync(cpDir) ? readdirSync(cpDir).filter((c) => !c.startsWith(".")) : [])];
      for (const cp of checkpoints) {
        const layers = checkpointLayers(ROOT, course, template, cp);
        const tree = layerTree(ROOT, course, template, layers);
        out.push({
          file: path.join("workspaces", course, template, `${cp}.json`),
          data: { template: `${course}/${template}`, checkpoint: cp, layers, hash: treeHash(tree), entries: sortedEntries(tree) },
        });
      }
    }
  }
  return out;
}

const icons = buildIcons();
const trees = buildTrees();
if (!check) {
  rmSync(path.join(OUT, "workspaces"), { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const write = (file, text) => {
    const full = path.join(OUT, file);
    mkdirSync(path.dirname(full), { recursive: true });
    // Unchanged files keep their times, so dev servers don't reload for nothing.
    if (existsSync(full) && readFileSync(full, "utf8") === text) return;
    writeFileSync(full, text);
  };
  write("file-icons.css", icons.css);
  write("file-icons.ts", icons.ts);
  for (const tree of trees) write(tree.file, `${JSON.stringify(tree.data)}\n`);
}
console.log(
  `   ✓ ${check ? "Checked" : "Wrote"} ${icons.count} file icons (${(icons.bytes / 1024).toFixed(1)} KB of data URIs) and ${trees.length} workspace starting tree${trees.length === 1 ? "" : "s"}`
);
