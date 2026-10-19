#!/usr/bin/env node
// Runs every runnable code snippet in the Learn lessons and the cheatsheets
// the way the app does (lib/snippet-harness.mjs builds each program), and
// reports the ones that don't run: a compile error, a crash, a timeout, or a
// snippet marked `error` that ran cleanly. Piston must be running, except for
// SQL, which runs on PGlite here (on the lesson's tables, or the playground's
// sample database for the cheatsheet).
//
//   node scripts/verify-snippets.mjs                  # everything
//   node scripts/verify-snippets.mjs python sql       # some languages
//   node scripts/verify-snippets.mjs go --source=reference --only=strings
//   node scripts/verify-snippets.mjs java --json=out.json   # failures, in full
//   node scripts/verify-snippets.mjs sql --pages=joins,ctes   # just these lessons or sections
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildProgram, segmentMarkdown } from "../lib/snippet-harness.mjs";
import { LANGUAGES, ROOT, clip, run } from "./lib/verify-kit.mjs";

const args = process.argv.slice(2);
const option = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const langs = args.filter((a) => !a.startsWith("--"));
const source = option("source");
const only = option("only");
const pages = option("pages")?.split(",").map((p) => p.trim()).filter(Boolean) ?? null;
const wanted = (id) => (!only || id.includes(only)) && (!pages || pages.includes(id));
const jsonOut = option("json");
const POOL = Number(process.env.SNIPPET_POOL ?? 8);

const sampleSrc = readFileSync(path.join(ROOT, "lib/sql/sample-db.ts"), "utf8");
const SAMPLE_DB_SQL = sampleSrc.slice(sampleSrc.indexOf("`") + 1, sampleSrc.lastIndexOf("`"));

/** Every runnable snippet in some Markdown, with where it came from. */
function snippetsIn(md, base) {
  return segmentMarkdown(md ?? "")
    .filter((s) => s.type === "fence" && s.runtime)
    .map((s, i) => ({ ...base, index: i, ...s }));
}

function collect(lang) {
  const out = [];
  if (!source || source === "learn") {
    const dir = path.join(ROOT, "content/learn", lang);
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "index.json").sort()) {
      const id = file.replace(/\.json$/, "");
      if (!wanted(id)) continue;
      const lesson = JSON.parse(readFileSync(path.join(dir, file), "utf8"));
      const base = { lang, source: "learn", file: `content/learn/${lang}/${file}`, page: id, setup: lesson.setup ?? "" };
      out.push(...snippetsIn(lesson.intro, { ...base, where: "intro" }));
      lesson.steps.forEach((step, si) => {
        out.push(...snippetsIn(step.body, { ...base, where: `steps[${si}].body` }));
        out.push(...snippetsIn(step.example?.explanation, { ...base, where: `steps[${si}].example.explanation` }));
      });
      out.push(...snippetsIn(lesson.recap, { ...base, where: "recap" }));
    }
  }
  if (!source || source === "reference") {
    const dir = path.join(ROOT, "content/reference", lang);
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".md")).sort()) {
      const id = file.replace(/\.md$/, "");
      if (!wanted(id)) continue;
      const md = readFileSync(path.join(dir, file), "utf8");
      out.push(...snippetsIn(md, { lang, source: "reference", file: `content/reference/${lang}/${file}`, page: id, where: id, setup: SAMPLE_DB_SQL }));
    }
  }
  return out;
}

/** Runs one snippet; returns a problem, or null when it behaved. */
async function check(s) {
  const program = buildProgram(s.runtime, s.content, s.harness);
  // SQL's "stdin" is setup: the page's tables, then the snippet's own.
  const input = s.runtime === "sql" ? [s.setup, s.stdin].filter((x) => x && x.trim()).join("\n") : (s.stdin ?? "");
  const r = await run(s.runtime, program, input);
  const failed = Boolean(r.compileError) || r.code !== 0 || Boolean(r.status);
  const output = clip([r.compileError, r.stdout, r.stderr].filter(Boolean).join("\n"));
  if (s.expectError) return failed ? null : { message: "marked `error` but ran cleanly", output, program };
  if (!failed) return null;
  const why = r.compileError ? "doesn't compile" : r.status ? `stopped (${r.status})` : `exited with ${r.code}`;
  return { message: why, output, program };
}

async function pool(items, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(POOL, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await worker(items[i]);
      }
    })
  );
  return results;
}

const failures = [];
let total = 0;
for (const lang of langs.length ? langs : LANGUAGES) {
  const snippets = collect(lang);
  total += snippets.length;
  const problems = await pool(snippets, check);
  const byPage = new Map();
  snippets.forEach((s, i) => {
    const key = `${lang}/${s.source}/${s.page}`;
    if (!byPage.has(key)) byPage.set(key, []);
    if (problems[i]) byPage.get(key).push({ s, p: problems[i] });
  });
  for (const [key, bad] of byPage) {
    if (!bad.length) continue;
    console.log(`✗ ${key}`);
    for (const { s, p } of bad) {
      console.log(`    ${s.where} snippet ${s.index + 1}: ${p.message}`);
      console.log(`      ${clip(s.content.split("\n")[0], 80)}`);
      if (p.output) console.log(`      ${clip(p.output.split("\n").find((l) => l.trim()) ?? "", 160)}`);
      failures.push({ lang, source: s.source, file: s.file, where: s.where, index: s.index, snippet: s.content, harness: s.harness, stdin: s.stdin, expectError: s.expectError, message: p.message, output: p.output, program: p.program });
    }
  }
  const failedHere = failures.filter((f) => f.lang === lang).length;
  console.log(`${lang}: ${snippets.length - failedHere}/${snippets.length} snippets run${failedHere ? "" : " ✓"}`);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(failures, null, 2));
console.log(`\n${total - failures.length}/${total} snippets run`);
process.exitCode = failures.length ? 1 : 0;
