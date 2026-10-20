#!/usr/bin/env node
// The pages that were there before the IDE still work: a Piston run, a
// runner run, a Learn check, the cheatsheet's search, and the compiler's
// Open playground link to the new playground.
//
// Usage: node tests/ide/e2e-existing.mjs <app url>
import { createRequire } from "node:module";
const require = createRequire(process.env.PW_CORE ? `${process.env.PW_CORE.replace(/\/$/, "")}/` : import.meta.url);
const { chromium } = require("playwright-core");
const base = process.argv[2] ?? "http://localhost:3410";
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const step = async (name, fn) => { try { await fn(); console.log("✔", name); } catch (e) { console.log("✖", name, e.message.split("\n")[0]); } };
await step("/python runs on Piston", async () => {
  await page.goto(`${base}/python`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Run/ }).first().click();
  await page.getByText("Start small. Ship something.").last().waitFor({ timeout: 30000 });
});
await step("/typescript runs on the runner", async () => {
  await page.goto(`${base}/typescript`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Run/ }).first().click();
  await page.locator("pre", { hasText: "Start small. Ship something." }).first().waitFor({ timeout: 30000 });
});
await step("a Learn part checks its practice", async () => {
  await page.goto(`${base}/python/learn/print/1?tab=code`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Check" }).click();
  await page.getByText(/tests? passed|of \d+ tests? passed|Solved!/).first().waitFor({ timeout: 30000 });
});
await step("the cheatsheet opens and searches", async () => {
  await page.goto(`${base}/python?panel=cheatsheet`, { waitUntil: "networkidle" });
  const search = page.getByRole("searchbox").first();
  await search.fill("sort a list");
  await page.waitForTimeout(1500);
  const text = await page.locator("main").innerText();
  if (!/sort/i.test(text)) throw new Error("no results mention sort");
});
await step("Open playground leads from /typescript to its playground", async () => {
  await page.goto(`${base}/typescript`, { waitUntil: "networkidle" });
  await page.getByRole("link", { name: /Open playground/ }).click();
  await page.waitForURL(/\/typescript\/playground$/);
  await page.locator("[role=treeitem][data-path='src/main.ts']").waitFor({ timeout: 10000 });
});
console.log("page errors:", errors);
await browser.close();
