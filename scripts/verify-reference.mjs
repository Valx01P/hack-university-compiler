#!/usr/bin/env node
// Lints the language reference (the compiler's cheatsheets) in
// content/reference/<language>/<category>.md: one file per category in
// content/reference/categories.json, each starting with a "# Title" line, in
// the house style and the Markdown subset the app renders.
//
//   npm run reference:verify                    # every language
//   npm run reference:verify -- java            # one language
//   npm run reference:verify -- java arrays     # specific categories
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { LANGUAGES, ROOT, lintMarkdown, lintProse, printResult } from "./lib/verify-kit.mjs";

const DIR = path.join(ROOT, "content", "reference");
// A language can have its own topics (SQL does) in <lang>/categories.json.
const categoriesFor = (lang) => {
  const own = path.join(DIR, lang, "categories.json");
  return JSON.parse(readFileSync(existsSync(own) ? own : path.join(DIR, "categories.json"), "utf8")).categories.map((c) => c.id);
};

const args = process.argv.slice(2);
if (args.length && !LANGUAGES.includes(args[0])) {
  console.error(`verify-reference: "${args[0]}" is not a language (${LANGUAGES.join(", ")})\nusage: node scripts/verify-reference.mjs [language [category ...]]`);
  process.exit(2);
}
const langs = args.length ? [args[0]] : LANGUAGES;
const only = args.slice(1);
for (const id of only) {
  if (!categoriesFor(langs[0]).includes(id)) {
    console.error(`verify-reference: "${id}" is not a ${langs[0]} category (${categoriesFor(langs[0]).join(", ")})`);
    process.exit(2);
  }
}

let ok = true;
let checked = 0;
for (const lang of langs) {
  const dir = path.join(DIR, lang);
  if (!existsSync(dir)) {
    if (args.length) {
      ok = false;
      printResult(lang, "reference", [{ where: `content/reference/${lang}`, message: "missing" }], []);
    }
    continue;
  }
  const CATEGORIES = categoriesFor(lang);
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".md"))) {
    if (!CATEGORIES.includes(f.slice(0, -3))) {
      ok = false;
      printResult(lang, f, [{ where: f, message: "not a category in content/reference/categories.json" }], []);
    }
  }
  for (const id of only.length ? only : CATEGORIES) {
    checked++;
    const errors = [];
    const warnings = [];
    const file = path.join(dir, `${id}.md`);
    if (!existsSync(file)) {
      errors.push({ where: `${id}.md`, message: "missing" });
    } else {
      const text = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
      const [first, ...rest] = text.split("\n");
      const body = rest.join("\n").trim();
      const title = first.replace(/^#\s+/, "");
      if (!/^#\s+\S/.test(first)) errors.push({ where: "line 1", message: 'must be the title, as "# Title"' });
      else if (title.length > 40) errors.push({ where: "title", message: "at most 40 characters" });
      else lintMarkdown("title", title, false, errors);
      if (!body) errors.push({ where: "body", message: "empty" });
      if (/^#\s/m.test(body)) errors.push({ where: "body", message: 'use "##" and "###" headings inside a section, "#" is only the title' });
      const fences = [...body.matchAll(/^```(\S*)/gm)].map((m) => m[1]);
      const langFences = fences.filter((_, i) => i % 2 === 0).filter((l) => l !== "stdin");
      if (!langFences.includes(lang)) errors.push({ where: "body", message: `needs at least one \`\`\`${lang} code block` });
      for (const l of langFences) {
        if (l !== lang && l !== "text") errors.push({ where: "body", message: `code blocks are \`\`\`${lang} or \`\`\`text, not "${l}"` });
      }
      lintMarkdown("body", body, true, errors);
      lintProse("body", body, errors);
      const lines = body.split("\n").length;
      if (lines > 260) warnings.push({ where: "body", message: `${lines} lines, keep a section scannable (under 260)` });
    }
    if (errors.length) ok = false;
    printResult(lang, `reference/${id}`, errors, warnings);
  }
}
console.log(`\n${checked} sections checked${ok ? ", all passed" : ""}`);
process.exitCode = ok && checked ? 0 : 1;
