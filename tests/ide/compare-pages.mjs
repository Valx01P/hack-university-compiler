#!/usr/bin/env node
// Pixel-compares existing pages of two production builds (this branch on
// one port, its base on another): the compilers, Learn's single-file parts,
// the cheatsheet and challenges panels, a dark theme, and hidden comments.
// Pages that differ are saved as -mine, -base, and -diff images in SHOTS.
//
// Usage: MINE=3410 BASE=3411 node tests/ide/compare-pages.mjs
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire(process.env.PW_CORE ? `${process.env.PW_CORE.replace(/\/$/, "")}/` : import.meta.url);
const { chromium } = require("playwright-core");
const { PNG } = require("pngjs");
const pixelmatch = require("pixelmatch").default ?? require("pixelmatch");
const shots = process.env.SHOTS ?? "/tmp";
const pages = process.env.ONLY ? [[process.env.ONLY, {}]] : [
  ["/python", {}],
  ["/javascript", {}],
  ["/cpp", {}],
  ["/sql", {}],
  ["/typescript", {}],
  ["/bash", {}],
  ["/python/learn/print/1", {}],
  ["/python/learn/print/2?tab=code", {}],
  ["/typescript/learn/hello-typescript/1", {}],
  ["/go/learn/hello-world/1", {}],
  ["/python?panel=cheatsheet", {}],
  ["/python?panel=challenges", {}],
  ["/typescript?panel=cheatsheet", {}],
  ["/python", { theme: "dark" }],
  ["/javascript/learn/print/1", { theme: "dracula", comments: "hidden" }],
];
const browser = await chromium.launch({ executablePath: process.env.CHROME });
let failed = 0;
for (const [path, opts] of pages) {
  const imgs = [];
  for (const port of [process.env.MINE ?? 3410, process.env.BASE ?? 3411]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    await context.addInitScript((o) => {
      if (o.theme) localStorage.setItem("hu-theme", o.theme);
      if (o.comments) localStorage.setItem("hu-code-comments", o.comments);
    }, opts);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`http://localhost:${port}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    await page.mouse.move(0, 0);
    const buf = await page.screenshot();
    imgs.push({ png: PNG.sync.read(buf), errors });
    await context.close();
  }
  const [a, b] = imgs;
  const { width, height } = a.png;
  const diff = new PNG({ width, height });
  const n = a.png.height === b.png.height ? pixelmatch(a.png.data, b.png.data, diff.data, width, height, { threshold: 0.1 }) : -1;
  const name = path.replace(/[^\w]+/g, "_") + (opts.theme ? `_${opts.theme}` : "");
  if (n !== 0) {
    writeFileSync(`${shots}/${name}-mine.png`, PNG.sync.write(a.png));
    writeFileSync(`${shots}/${name}-base.png`, PNG.sync.write(b.png));
    if (n > 0) writeFileSync(`${shots}/${name}-diff.png`, PNG.sync.write(diff));
  }
  const errs = [...a.errors, ...b.errors];
  console.log(`${n === 0 ? "same" : "DIFF"} ${path} ${JSON.stringify(opts)} ${n === 0 ? "" : `(${n} pixels)`}${errs.length ? ` errors: ${errs.join(" | ").slice(0, 200)}` : ""}`);
  if (n !== 0) failed++;
}
await browser.close();
console.log(`${pages.length - failed} of ${pages.length} pages pixel-identical`);
