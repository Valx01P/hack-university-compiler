#!/usr/bin/env node
// A Learn part in the workspace format, end to end: the lesson beside the
// IDE, a run example in its own workspace, and Check in Your workspace with
// one criterion per row and the lesson's "2 of 2 criteria pass". It needs the
// lesson in tests/ide/fixtures/learn (copy it into a LEARN_CONTENT_DIR draft
// of the TypeScript course for the app, and into the runner's content/learn
// so its checks find the suite), see tests/ide/README.md.
//
// Usage: node tests/ide/e2e-learn.mjs <app url>
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const require = createRequire(process.env.PW_CORE ? `${process.env.PW_CORE.replace(/\/$/, "")}/` : import.meta.url);
const { chromium } = require("playwright-core");
const base = process.argv[2] ?? "http://localhost:3410";
const shots = process.env.SHOTS ?? "/tmp";
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", (r) => { if (r.status() >= 400 && r.url().includes("/api/")) errors.push(`${r.url()} ${r.status()}`); });
const step = async (name, fn) => { try { await fn(); console.log("✔", name); } catch (e) { console.log("✖", name, process.env.DEBUG ? e.message : e.message.split("\n")[0]); await page.screenshot({ path: `${shots}/learn-fail.png` }); } };
const settled = () => page.waitForFunction(() => !document.documentElement.hasAttribute("data-restore") && !document.documentElement.hasAttribute("data-restore-editor") && document.querySelector("[data-ide][data-settled]"), null, { timeout: 10000 });
await step("opens the part with the lesson beside the IDE", async () => {
  await page.goto(`${base}/typescript/learn/playground-tour/1?tab=code`, { waitUntil: "domcontentloaded" });
  await settled();
  await page.getByRole("heading", { name: "A Project of Your Own" }).waitFor();
  assert.equal(await page.locator("[role=tab][aria-selected=true]", { hasText: "Your workspace" }).count(), 1);
  assert.equal(await page.locator("[role=tab][aria-selected=true]", { hasText: "greet.ts" }).count(), 1);
});
await step("the run example opens in its own workspace and runs", async () => {
  await page.getByRole("tab", { name: /Example 2/ }).click();
  await settled();
  await page.locator("[role=treeitem][data-path='src/greet.ts']").click();
  await page.waitForFunction(() => (document.querySelector(".cm-content")?.textContent ?? "").includes("toUpperCase"), null, { timeout: 8000 });
  await page.locator("[data-ide]").getByRole("button", { name: /Run/ }).click();
  await page.waitForFunction(() => [...document.querySelectorAll("[data-terminal] .xterm-rows")].some((el) => (el.textContent ?? "").includes("HELLO, TYPESCRIPT!")), null, { timeout: 30000 });
  assert.match(page.url(), /tab=ex2/);
});
// Puts the cursor at the end of a line from the keyboard (a click on a line
// wider than the editor would scroll it sideways first).
const endOfLine = async (n) => {
  await page.locator(".cm-content").focus();
  await page.keyboard.press("Meta+ArrowUp");
  for (let i = 1; i < n; i++) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("End");
};
await step("Your workspace: fix greet, Check, and every criterion passes", async () => {
  await page.getByRole("tab", { name: /Your workspace/ }).click();
  await settled();
  // Start from the starter, whatever an earlier run left.
  await page.evaluate(async () => {
    const id = document.querySelector("[data-ide]").getAttribute("data-workspace-id");
    await fetch(`/api/workspaces/${id}/reset`, { method: "POST", headers: { "Content-Type": "application/json", "X-HU": "1" }, body: JSON.stringify({ scope: "all" }) });
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await settled();
  await page.locator("[role=treeitem][data-path='src/greet.ts']").click();
  await page.waitForFunction(() => (document.querySelector(".cm-content")?.textContent ?? "").includes("export function greet"), null, { timeout: 8000 });
  await endOfLine(4);
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Backspace");
  await page.keyboard.type("?");
  await page.locator("[data-ide]").getByRole("button", { name: "Check" }).click();
  await page.getByText(/All 2 criteria pass/).waitFor({ timeout: 60000 });
  await page.getByText("2 of 2 criteria pass").waitFor({ timeout: 5000 });
  await page.locator("#practice").getByText("Solved").waitFor({ state: "visible", timeout: 5000 });
});
await step("a failing check names what's wrong", async () => {
  await endOfLine(4);
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Backspace");
  await page.keyboard.type("!");
  await page.locator("[data-ide]").getByRole("button", { name: "Check" }).click();
  await page.getByText("1 of 2 criteria pass").first().waitFor({ timeout: 60000 });
});
await page.screenshot({ path: `${shots}/learn-final.png` });
console.log("errors:", errors);
await browser.close();
