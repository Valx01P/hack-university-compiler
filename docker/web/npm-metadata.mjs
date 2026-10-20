// npm-metadata.mjs: runs while hu/web is built, after every lockfile has been
// installed once into the npm cache. It writes each cached package's registry
// metadata into the cache too, listing only the versions the cache holds, so
// `npm install zustand` in a workspace with no network picks a version whose
// tarball is there.
//
//   node npm-metadata.mjs --cache /opt/hu/npm-cache <package-lock.json>...
//
// npm install reads a package's abbreviated metadata (every version it ever
// published) before it picks one. Cached whole, that metadata is 695 MB for the
// Next.js templates alone (measured), and it would offer versions the cache
// lacks. So this script builds each package's metadata from the registry's
// per-version documents for exactly the versions in the lockfiles, and stores
// it under the key and request headers npm itself uses: it copies them from
// one real lookup (npm install --package-lock-only zod) into a scratch cache.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

const npmRequire = createRequire("/usr/local/lib/node_modules/npm/package.json");
const cacache = npmRequire("cacache");
const semver = npmRequire("semver");

const REGISTRY = "https://registry.npmjs.org/";
const KEY_PREFIX = "make-fetch-happen:request-cache:";
// The fields npm's abbreviated metadata keeps for each version.
const FIELDS = [
  "name", "version", "deprecated", "dependencies", "optionalDependencies", "devDependencies",
  "bundleDependencies", "bundledDependencies", "peerDependencies", "peerDependenciesMeta", "bin",
  "directories", "dist", "engines", "_hasShrinkwrap", "cpu", "os", "libc", "funding", "license",
];

const args = process.argv.slice(2);
const cacheAt = args.indexOf("--cache");
if (cacheAt < 0 || !args[cacheAt + 1]) throw new Error("usage: npm-metadata.mjs --cache <dir> <package-lock.json>...");
// npm keeps its cacache store in the _cacache folder of its cache setting.
const store = path.join(args[cacheAt + 1], "_cacache");
const lockfiles = args.filter((_, i) => i !== cacheAt && i !== cacheAt + 1);

/** Every registry package in the lockfiles, by name, with its versions. */
const wanted = new Map();
for (const file of lockfiles) {
  const lock = JSON.parse(readFileSync(file, "utf8"));
  for (const [key, entry] of Object.entries(lock.packages ?? {})) {
    if (!key || entry.link || !entry.version || !entry.resolved?.startsWith(REGISTRY)) continue;
    const name = entry.name ?? key.slice(key.lastIndexOf("node_modules/") + "node_modules/".length);
    if (!wanted.has(name)) wanted.set(name, new Map());
    wanted.get(name).set(entry.version, entry.integrity);
  }
}

const escaped = (name) => name.replace("/", "%2f");

/** The index metadata npm writes for an abbreviated metadata lookup, from a real one. */
function probeMetadata() {
  const dir = mkdtempSync(path.join(tmpdir(), "hu-npm-probe-"));
  const probeCache = path.join(dir, "cache");
  writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "probe", version: "1.0.0", private: true }));
  const r = spawnSync("npm", ["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund",
    "--offline=false", "--cache", probeCache, "zod@4.6.7"], { cwd: dir, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`The probe lookup failed:\n${r.stderr}`);
  return cacache.get.info(path.join(probeCache, "_cacache"), `${KEY_PREFIX}${REGISTRY}zod`).then((info) => {
    if (!info?.metadata?.reqHeaders?.accept) throw new Error("The probe lookup left no metadata entry for zod.");
    return info.metadata;
  });
}

async function fetchJson(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (res.ok) return await res.json();
      if (res.status < 500 || attempt === 4) throw new Error(`${url}: HTTP ${res.status}`);
    } catch (err) {
      if (attempt === 4) throw err;
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
  }
}

function abbreviate(doc) {
  const out = {};
  for (const field of FIELDS) if (doc[field] !== undefined) out[field] = doc[field];
  const scripts = doc.scripts ?? {};
  if (scripts.preinstall || scripts.install || scripts.postinstall || doc.gypfile) out.hasInstallScript = true;
  if (out.dist) out.dist = { ...out.dist, signatures: undefined, "npm-signature": undefined };
  return out;
}

const template = await probeMetadata();
const names = [...wanted.keys()].sort();
let next = 0;
let written = 0;
let versions = 0;
async function worker() {
  while (next < names.length) {
    const name = names[next++];
    const docs = {};
    for (const [version, integrity] of wanted.get(name)) {
      const doc = await fetchJson(`${REGISTRY}${escaped(name)}/${version}`);
      if (doc.name !== name || doc.version !== version) throw new Error(`${name}@${version}: the registry answered ${doc.name}@${doc.version}`);
      if (integrity && doc.dist?.integrity !== integrity) throw new Error(`${name}@${version}: integrity differs from the lockfile`);
      docs[version] = abbreviate(doc);
      versions++;
    }
    const latest = semver.rsort(Object.keys(docs))[0];
    const packument = { name, "dist-tags": { latest }, versions: docs, modified: new Date().toISOString() };
    const url = `${REGISTRY}${escaped(name)}`;
    const metadata = {
      ...template,
      time: Date.now(),
      url,
      resHeaders: { ...template.resHeaders, etag: undefined, "last-modified": undefined },
    };
    await cacache.put(store, `${KEY_PREFIX}${url}`, JSON.stringify(packument), { metadata });
    written++;
  }
}
await Promise.all(Array.from({ length: 24 }, worker));
console.log(`npm metadata: ${written} packages, ${versions} versions`);
