#!/usr/bin/env node
// Installs the compiler's language runtimes into the local Piston sandbox
// (see docker-compose.yml). Packages persist in the piston-packages volume, so
// this only needs to run once. Safe to re-run: installed packages are skipped.
//
//   npm run piston:install                  # every language
//   npm run piston:install -- python java   # just these (language ids or package names)
//   npm run piston:status                   # what's installed
import { readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";

const PISTON_URL = (process.env.PISTON_URL ?? "http://127.0.0.1:2000/api/v2").replace(/\/+$/, "");

// Language id -> Piston runtime + the package that provides it. Shared with the
// app (lib/piston.ts) so the two can never drift.
const RUNTIMES = JSON.parse(
  readFileSync(new URL("../lib/runtimes.json", import.meta.url), "utf8")
);

const args = process.argv.slice(2);
const listOnly = args.includes("--list");
const wanted = args.filter((a) => !a.startsWith("--"));

// node:http instead of fetch on purpose: a package install holds the request
// open until the whole toolchain is downloaded, which can outlast fetch's
// built-in 5 minute header timeout on big packages (swift, haskell, dotnet).
function api(path, body) {
  const url = new URL(`${PISTON_URL}${path}`);
  const payload = body ? JSON.stringify(body) : undefined;
  return new Promise((resolve, reject) => {
    const req = (url.protocol === "https:" ? https : http).request(
      url,
      {
        method: body ? "POST" : "GET",
        headers: payload
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
          : {},
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          let data = null;
          try {
            data = JSON.parse(raw);
          } catch {
            /* non-JSON error body */
          }
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
          else reject(new Error(data?.message ?? `HTTP ${res.statusCode}`));
        });
      }
    );
    req.on("error", reject);
    req.end(payload);
  });
}

async function waitForPiston() {
  for (let i = 0; i < 30; i++) {
    try {
      return await api("/runtimes");
    } catch {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  console.error(`Piston isn't reachable at ${PISTON_URL}.`);
  console.error("Start it first with: npm run piston:up");
  process.exit(1);
}

/** Numeric, dot-wise version compare (the package index isn't sorted). */
function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

function printStatus(runtimes) {
  for (const [id, { runtime }] of Object.entries(RUNTIMES)) {
    const rt = runtimes.find((r) => r.language === runtime);
    const status = rt ? `${rt.runtime ?? rt.language} ${rt.version}` : "not installed";
    console.log(`  ${id.padEnd(11)} ${status}`);
  }
}

console.log(`Waiting for Piston at ${PISTON_URL} …`);
const runtimes = await waitForPiston();

if (listOnly) {
  printStatus(runtimes);
  process.exit(0);
}

// Resolve requested names (language ids like "cpp", or package names like
// "gcc") to the set of packages to install.
const allPackages = [...new Set(Object.values(RUNTIMES).map((r) => r.package))];
let packages = allPackages;
if (wanted.length) {
  packages = [];
  for (const name of wanted) {
    const pkg = RUNTIMES[name]?.package ?? (allPackages.includes(name) ? name : null);
    if (!pkg) {
      console.error(`Unknown language "${name}". Pick from: ${Object.keys(RUNTIMES).join(", ")}`);
      process.exit(1);
    }
    if (!packages.includes(pkg)) packages.push(pkg);
  }
}

const index = await api("/packages");
let failed = 0;
for (const pkg of packages) {
  const versions = index.filter((p) => p.language === pkg);
  if (!versions.length) {
    console.warn(`  ⚠ no package found for ${pkg}`);
    failed++;
    continue;
  }
  const newest = versions.sort((a, b) => compareVersions(b.language_version, a.language_version))[0];
  if (newest.installed) {
    console.log(`✓ ${pkg} ${newest.language_version} (already installed)`);
    continue;
  }
  const started = Date.now();
  process.stdout.write(`→ installing ${pkg} ${newest.language_version} … `);
  try {
    await api("/packages", { language: pkg, version: newest.language_version });
    console.log(`done in ${Math.round((Date.now() - started) / 1000)}s`);
  } catch (err) {
    console.log("failed");
    console.error(`  ${err.message}`);
    failed++;
  }
}

console.log("\nInstalled runtimes:");
printStatus(await api("/runtimes"));
if (failed) process.exit(1);
