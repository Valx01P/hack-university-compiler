#!/usr/bin/env node
// Downloads the small embedding model the cheatsheet search uses to match
// what you mean, not just the words you typed (lib/search/cheatsheet-search.ts):
// Model2Vec potion-base-8M, a 30 MB table of word vectors distilled from a
// sentence transformer (MIT license). It goes into .models/ (not committed),
// pinned to one revision and checked against known hashes. Safe to re-run:
// files already in place are skipped. Search works without it, on words alone.
//
//   npm run search:setup
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

const REPO = "minishlab/potion-base-8M";
const REVISION = "bf8b056651a2c21b8d2565580b8569da283cab23";
const FILES = {
  "model.safetensors": "f65d0f325faadc1e121c319e2faa41170d3fa07d8c89abd48ca5358d9a223de2",
  "tokenizer.json": "e67e803f624fb4d67dea1c730d06e1067e1b14d830e2c2202569e3ef0f70bb50",
};
const DIR = path.join(import.meta.dirname, "..", ".models", "potion-base-8M");

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

mkdirSync(DIR, { recursive: true });
let failed = 0;
for (const [name, hash] of Object.entries(FILES)) {
  const file = path.join(DIR, name);
  if (existsSync(file) && sha256(readFileSync(file)) === hash) {
    console.log(`✓ ${name} (already downloaded)`);
    continue;
  }
  process.stdout.write(`→ downloading ${name} … `);
  try {
    const res = await fetch(`https://huggingface.co/${REPO}/resolve/${REVISION}/${name}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (sha256(buf) !== hash) throw new Error("the download doesn't match the expected hash");
    writeFileSync(`${file}.part`, buf);
    renameSync(`${file}.part`, file);
    console.log(`done (${(buf.length / 1e6).toFixed(1)} MB)`);
  } catch (err) {
    console.log("failed");
    console.error(`  ${err.message}`);
    failed++;
  }
}
console.log(failed ? "\nSearch will work on words alone until this succeeds." : `\nThe cheatsheet search model is ready in ${path.relative(process.cwd(), DIR) || DIR}.`);
process.exitCode = failed ? 1 : 0;
