#!/usr/bin/env node
// More of the IDE, end to end, in a real browser against a running app and
// its runner (run e2e-playground.mjs first): the first paint (the IDE shows
// whole, already on the address's file and panel), drag to move in the
// explorer, a file changed in the terminal while it had unsaved edits (the
// conflict, and Keep mine), quick open, the address across a reload, full
// screen, and a phone-sized screen.
//
// Usage: node tests/ide/e2e-more.mjs <app url>   (PW_CORE, CHROME, SHOTS as in e2e-playground.mjs)
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const require = createRequire(process.env.PW_CORE ? `${process.env.PW_CORE.replace(/\/$/, "")}/` : import.meta.url);
const { chromium } = require("playwright-core");
const base = process.argv[2] ?? "http://localhost:3410";
const shots = process.env.SHOTS ?? "/tmp";
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", (r) => { if (r.status() >= 500 && r.url().includes("/api/")) errors.push(`${r.url()} ${r.status()}`); });
const step = async (name, fn) => { try { await fn(); console.log("✔", name); } catch (e) { console.log("✖", name, e.message.split("\n")[0]); await page.screenshot({ path: `${shots}/more-fail-${name.slice(0, 20).replace(/\W+/g, "_")}.png` }); } };
const row = (p) => page.locator(`[role=treeitem][data-path="${p}"]`);
const settled = () => page.waitForFunction(() => !document.documentElement.hasAttribute("data-restore") && document.querySelector("[data-ide][data-settled]"), null, { timeout: 10000 });
const api = (path, init) => page.evaluate(async ([path, init]) => {
  const id = document.querySelector("[data-ide]").getAttribute("data-workspace-id");
  const res = await fetch(`/api/workspaces/${id}/${path}`, { cache: "no-store", ...init, headers: { "X-HU": "1", "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  return res.ok ? res.text() : `HTTP ${res.status}`;
}, [path, init]);
const typeInTerminal = async (text) => {
  await page.locator("[data-terminal] .xterm-helper-textarea").first().focus();
  await page.keyboard.press("Control+C");
  await page.keyboard.type(text, { delay: 5 });
  await page.keyboard.press("Enter");
};

await step("first paint: the IDE shows whole, never half restored", async () => {
  const states = [];
  await page.goto(`${base}/typescript/playground/2?file=src/greet.ts&dock=server`, { waitUntil: "commit" });
  for (let i = 0; i < 30; i++) {
    states.push(await page.evaluate(() => ({
      ide: Boolean(document.querySelector("[data-ide]")),
      hidden: document.documentElement.hasAttribute("data-restore"),
      rows: document.querySelectorAll("[role=treeitem]").length,
      active: document.querySelector("[aria-label='Open files'] [role=tab][aria-selected=true]")?.textContent ?? null,
    })).catch(() => null));
    await page.waitForTimeout(50);
  }
  await settled();
  // Shown only once the tab the address asked for is active.
  const shown = states.filter((s) => s && s.ide && !s.hidden);
  assert.ok(shown.length > 0, "it shows");
  assert.ok(shown.every((s) => s.rows > 0), "the tree is there when it shows");
  // From its first frame (the server's markup, then hydration) until it's
  // ready, the IDE was hidden: no frame showed it with the template's tabs
  // instead of the address's file.
  const early = states.filter((s) => s && s.ide && !s.hidden && s.active && !/greet\.ts/.test(s.active));
  assert.equal(early.length, 0, "never showed the wrong file");
  assert.equal(await page.locator("[role=tab][aria-selected=true]", { hasText: "greet.ts" }).count(), 1);
  assert.equal(await page.locator("[role=tab][aria-selected=true]", { hasText: /^Server/ }).count(), 1);
});

await step("drag a file into a folder", async () => {
  await api("reset", { method: "POST", body: JSON.stringify({ scope: "all" }) });
  await page.reload({ waitUntil: "domcontentloaded" });
  await settled();
  await row("data/sample.json").waitFor({ state: "detached", timeout: 2000 }).catch(() => {});
  // Into a closed folder: the file leaves the root, and the disk has it there.
  await row("tsconfig.json").dragTo(row("test"));
  await row("tsconfig.json").waitFor({ state: "detached", timeout: 8000 });
  assert.match(await api("file?path=test%2Ftsconfig.json"), /compilerOptions/);
  // Out of an open folder into another.
  await row("test").click();
  await row("test/tsconfig.json").dragTo(row("src"));
  await row("src/tsconfig.json").waitFor({ timeout: 8000 });
  assert.match(await api("file?path=src%2Ftsconfig.json"), /compilerOptions/);
  await api("reset", { method: "POST", body: JSON.stringify({ scope: "all" }) });
});

await step("a file changed in the terminal while unsaved shows the conflict, and Keep mine wins", async () => {
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("hu-ide-settings-v1") || "{}");
    localStorage.setItem("hu-ide-settings-v1", JSON.stringify({ ...raw, autosave: false }));
    window.dispatchEvent(new Event("hu:ide-settings"));
  });
  await row("src/greet.ts").click();
  await page.locator(".cm-content").focus();
  await page.keyboard.press("Meta+ArrowDown");
  await page.keyboard.type("// mine\n");
  await page.locator("[data-ide]").getByRole("tab", { name: /Terminal 1/ }).click();
  const start = page.getByText(/to start a shell in \/workspace/);
  if (await start.count()) await start.click();
  await page.locator("[data-terminal] .xterm-rows").first().waitFor({ timeout: 20000 });
  await page.waitForFunction(() => /learner@\w+/.test(document.querySelector("[data-terminal] .xterm-rows")?.textContent ?? ""), null, { timeout: 20000 });
  await typeInTerminal("echo '// theirs' >> src/greet.ts");
  await page.getByText(/changed on disk while you had unsaved edits/).waitFor({ timeout: 8000 });
  await page.getByRole("button", { name: "Keep mine" }).click();
  await page.waitForFunction(() => !document.body.textContent.includes("changed on disk while you had unsaved edits"), null, { timeout: 8000 });
  const disk = await api("file?path=src%2Fgreet.ts");
  assert.match(disk, /\/\/ mine/);
  assert.doesNotMatch(disk, /theirs/);
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("hu-ide-settings-v1") || "{}");
    localStorage.setItem("hu-ide-settings-v1", JSON.stringify({ ...raw, autosave: true }));
    window.dispatchEvent(new Event("hu:ide-settings"));
  });
});

await step("quick open (Mod+P) opens a file", async () => {
  await page.locator(".cm-content").focus();
  await page.keyboard.press("Meta+p");
  await page.getByRole("combobox").fill("sample");
  await page.keyboard.press("Enter");
  await page.locator("[role=tab][aria-selected=true]", { hasText: "sample.json" }).waitFor({ timeout: 5000 });
});

await step("the address keeps the file and the panel across a reload", async () => {
  await page.locator("[data-ide]").getByRole("tab", { name: /^Server/ }).click();
  await page.waitForTimeout(400);
  assert.match(page.url(), /file=data%2Fsample\.json|file=data\/sample\.json/);
  assert.match(page.url(), /dock=server/);
  await page.reload({ waitUntil: "domcontentloaded" });
  await settled();
  await page.locator("[role=tab][aria-selected=true]", { hasText: "sample.json" }).waitFor({ timeout: 5000 });
  await page.locator("[role=tab][aria-selected=true]", { hasText: /^Server/ }).waitFor({ timeout: 5000 });
});

await step("full screen covers the window and Escape leaves it", async () => {
  await page.locator("[data-ide]").getByRole("button", { name: "Toggle full screen" }).click();
  await page.waitForFunction(() => document.documentElement.hasAttribute("data-full"));
  const box = await page.locator("[data-workspace]").boundingBox();
  assert.ok(box && box.y === 0 && box.width === 1440, `covers the window (${JSON.stringify(box)})`);
  await page.waitForFunction(() => /full=1/.test(location.search), null, { timeout: 3000 });
  await page.screenshot({ path: `${shots}/fullscreen.png` });
  await page.locator("[role=treeitem]").first().focus();
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.documentElement.hasAttribute("data-full"));
});

await step("a phone shows one region at a time", async () => {
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const p = await phone.newPage();
  await p.goto(`${base}/typescript/playground/2`, { waitUntil: "domcontentloaded" });
  await p.waitForFunction(() => document.querySelector("[data-ide][data-settled]"), null, { timeout: 10000 });
  await p.screenshot({ path: `${shots}/phone-code.png` });
  await p.getByRole("tab", { name: "Files" }).click();
  await p.locator("[role=treeitem][data-path='README.md']").click();
  await p.screenshot({ path: `${shots}/phone-after-file.png` });
  const scrollW = await p.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(scrollW <= 390, `no sideways scroll (${scrollW})`);
  await phone.close();
});

console.log("errors:", errors);
await browser.close();
