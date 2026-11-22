#!/usr/bin/env node
// The playground end to end, in a real browser: /playground against a
// running app (a production build) and its runner, whose terminal is a real
// shell on this computer (so run it with its own HU_DATA_DIR and
// HU_TMUX_SOCKET). It drives what a learner does and checks what they'd see:
//
//   the README in its tab, the rail's Playground icon, tabs that open and
//   close, a file made in the terminal that just appears in the Explorer, an
//   edit to a file that was there waiting for review in its tab (Accept and
//   Reject), the terminal open at the bottom from the start, its border
//   dragging and folding, the Explorer folding (Mod+B), quick open (Mod+P),
//   a reload that keeps the terminal's session and the layout with nothing
//   shown half restored, full screen, and a phone.
//
// Usage: node tests/ide/e2e-playground.mjs <app url>
//
// Needs playwright-core (PW_CORE, a folder whose node_modules has it) and a
// Chrome (CHROME, or playwright's own). SHOTS is where screenshots go.

import { createRequire } from "node:module";
import assert from "node:assert/strict";

const base = process.argv[2] ?? "http://localhost:3410";
const require = createRequire(process.env.PW_CORE ? `${process.env.PW_CORE.replace(/\/$/, "")}/` : import.meta.url);
const { chromium } = require("playwright-core");
const SHOTS = process.env.SHOTS ?? null;
const shot = (page, name) => (SHOTS ? page.screenshot({ path: `${SHOTS}/${name}.png` }) : Promise.resolve());

const results = [];
async function step(name, fn) {
  const started = Date.now();
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`✔ ${name} (${Date.now() - started} ms)`);
  } catch (err) {
    results.push({ name, ok: false, error: err.message });
    console.log(`✖ ${name}: ${err.message.split("\n")[0]}`);
    await shot(page, `fail-${results.length}`).catch(() => {});
  }
}

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("response", (r) => {
  if (r.status() >= 500 && r.url().includes("/api/")) errors.push(`${r.request().method()} ${r.url().replace(base, "")} answered ${r.status()}`);
});

const mod = process.platform === "darwin" ? "Meta" : "Control";
const row = (path) => page.locator(`[role=treeitem][data-path="${path}"]`);
const tab = (name) => page.locator("[aria-label='Open files'] [role=tab]", { hasText: name });
const review = page.getByRole("region", { name: "Changes to review" });
// Shown, and the runner's terminals adopted.
const revealed = (p = page) =>
  p.waitForFunction(() => !document.documentElement.hasAttribute("data-restore-editor") && document.querySelector("[data-workspace][data-settled]"), null, { timeout: 10000 });
const apiFile = (path) =>
  page.evaluate(async (p) => {
    const id = document.querySelector("[data-workspace]")?.getAttribute("data-workspace-id");
    const res = await fetch(`/api/workspaces/${id}/file?path=${encodeURIComponent(p)}`, { cache: "no-store" });
    return res.ok ? res.text() : `HTTP ${res.status}`;
  }, path);
// The terminal draws with WebGL (no DOM rows), so its text is read from the
// screen it keeps in sessionStorage (terminal-view.tsx), half a second behind.
const terminalText = (p = page) =>
  p.evaluate(() => {
    const out = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith("hu-term-screen:")) out.push(sessionStorage.getItem(key) ?? "");
    }
    return out.join("\n").replace(/\x1b\[[0-9;?]*[ -\/]*[@-~]/g, "").replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, "");
  });
async function waitForTerminal(re, p = page, timeout = 10000) {
  const until = Date.now() + timeout;
  for (;;) {
    if (re.test(await terminalText(p))) return;
    if (Date.now() > until) throw new Error(`the terminal never showed ${re}`);
    await p.waitForTimeout(200);
  }
}
async function typeInTerminal(text) {
  await page.locator("[data-terminal] .xterm-helper-textarea").first().focus();
  // A clean prompt line first, whatever the shell kept from before.
  await page.keyboard.press("Control+C");
  await page.keyboard.type(text, { delay: 5 });
  await page.keyboard.press("Enter");
}
const html = (attr) => page.evaluate((a) => document.documentElement.hasAttribute(a), attr);
const terminalBox = () => page.locator("[data-playground-terminal]").boundingBox();

await step("opens /playground with the README in its tab and the rail's Playground icon", async () => {
  await page.goto(`${base}/playground`, { waitUntil: "domcontentloaded" });
  await revealed();
  await row("README.md").waitFor({ timeout: 5000 });
  assert.equal(await row("AGENTS.md").count(), 0, "AGENTS.md stays hidden");
  assert.equal(await row("CLAUDE.md").count(), 0, "CLAUDE.md stays hidden");
  await page.locator("[role=tab][aria-selected=true]", { hasText: "README.md" }).waitFor({ timeout: 5000 });
  await page.waitForFunction(() => (document.querySelector(".cm-content")?.textContent ?? "").includes("This is your playground"), null, { timeout: 5000 });
  const link = page.getByRole("navigation", { name: "Courses" }).getByRole("link", { name: "Playground" });
  assert.equal(await link.getAttribute("aria-current"), "page");
  assert.equal(await link.getAttribute("href"), "/playground");
  assert.equal(await page.title(), "Hack University - Playground");
  await shot(page, "01-readme");
});

await step("the terminal is open at the bottom from the start", async () => {
  assert.equal(await html("data-playground-terminal-folded"), false);
  await page.locator("[data-terminal] .xterm-screen").first().waitFor({ timeout: 20000 });
  // The shell drew its prompt.
  await waitForTerminal(/\S/, page, 20000);
  const box = await terminalBox();
  const region = await page.locator("[data-editor-pane]").boundingBox();
  assert.ok(box && region && Math.abs(box.y + box.height - (region.y + region.height)) < 2, "at the bottom");
  assert.ok(box.height > region.height * 0.25 && box.height < region.height * 0.45, `about a third of the height (${box.height} of ${region.height})`);
});

await step("tabs open and close, like VS Code", async () => {
  await page.getByRole("button", { name: "New file" }).click();
  await page.keyboard.type("hello.js");
  await page.keyboard.press("Enter");
  await row("hello.js").waitFor({ timeout: 5000 });
  await page.locator("[role=tab][aria-selected=true]", { hasText: "hello.js" }).waitFor({ timeout: 5000 });
  await page.locator(".cm-content").click();
  await page.keyboard.type('console.log("hi from the playground");\n');
  await page.waitForFunction(() => !document.querySelector('[aria-label="unsaved"]'), null, { timeout: 5000 });
  assert.match(await apiFile("hello.js"), /hi from the playground/);
  assert.equal(await tab("README.md").count(), 1, "README.md keeps its tab");
  await tab("README.md").click();
  await page.locator("[role=tab][aria-selected=true]", { hasText: "README.md" }).waitFor({ timeout: 3000 });
  await page.getByRole("button", { name: "Close hello.js" }).click();
  await tab("hello.js").waitFor({ state: "detached", timeout: 3000 });
  await row("hello.js").click();
  await page.locator("[role=tab][aria-selected=true]", { hasText: "hello.js" }).waitFor({ timeout: 3000 });
  await page.waitForFunction(() => (document.querySelector(".cm-content")?.textContent ?? "").includes("hi from the playground"), null, { timeout: 3000 });
  await shot(page, "02-tabs");
});

await step("a file made in the terminal just appears in the Explorer, with no review", async () => {
  await typeInTerminal("echo made-in-the-terminal > notes.txt");
  await row("notes.txt").waitFor({ timeout: 5000 });
  await page.waitForTimeout(800);
  assert.equal(await review.count(), 0, "nothing to review");
  assert.match(await apiFile("notes.txt"), /made-in-the-terminal/);
  await shot(page, "03-new-file-from-terminal");
});

await step("an edit to a file that was there waits for review in its tab, and Accept keeps it", async () => {
  await row("notes.txt").click();
  await page.locator("[role=tab][aria-selected=true]", { hasText: "notes.txt" }).waitFor({ timeout: 3000 });
  await typeInTerminal("echo a-line-from-the-terminal >> notes.txt");
  await review.waitFor({ timeout: 8000 });
  assert.match(await review.textContent(), /Changes to notes\.txt from outside the editor/);
  await page.locator(".cm-changedLine, .cm-insertedLine").first().waitFor({ timeout: 5000 });
  assert.equal(await tab("notes.txt").locator("[aria-label='changed outside the editor']").count(), 1, "its tab is marked");
  await shot(page, "04-review");
  // Another tab has no review of its own.
  await tab("hello.js").click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator(".cm-changedLine, .cm-insertedLine, .cm-deletedChunk").count(), 0, "hello.js shows no review");
  await tab("notes.txt").click();
  await page.locator(".cm-changedLine, .cm-insertedLine").first().waitFor({ timeout: 5000 });
  await review.getByRole("button", { name: "Accept" }).click();
  await review.waitFor({ state: "detached", timeout: 5000 });
  assert.match(await apiFile("notes.txt"), /a-line-from-the-terminal/);
});

await step("Reject puts back what was there", async () => {
  await tab("hello.js").click();
  await typeInTerminal("echo '// to reject' >> hello.js");
  await review.waitFor({ timeout: 8000 });
  await review.getByRole("button", { name: "Reject" }).click();
  await review.waitFor({ state: "detached", timeout: 5000 });
  await page.waitForFunction(() => !(document.querySelector(".cm-content")?.textContent ?? "").includes("to reject"), null, { timeout: 5000 });
  assert.doesNotMatch(await apiFile("hello.js"), /to reject/);
});

await step("the terminal's border drags, and folds it to its bar and back", async () => {
  const handle = page.getByRole("separator", { name: "Resize the terminal" });
  const before = await terminalBox();
  const h = await handle.boundingBox();
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2, h.y - 120, { steps: 8 });
  await page.mouse.up();
  const taller = await terminalBox();
  assert.ok(taller.height > before.height + 100, `taller (${before.height} to ${taller.height})`);
  // Dragged well down, it folds to its bar.
  const h2 = await handle.boundingBox();
  await page.mouse.move(h2.x + h2.width / 2, h2.y + h2.height / 2);
  await page.mouse.down();
  await page.mouse.move(h2.x + h2.width / 2, 895, { steps: 10 });
  await page.mouse.up();
  await page.waitForFunction(() => document.documentElement.hasAttribute("data-playground-terminal-folded"), null, { timeout: 3000 });
  assert.ok((await terminalBox()).height < 40, "only its bar");
  await shot(page, "05-terminal-folded");
  await page.getByRole("button", { name: "Show the terminal" }).click();
  await page.waitForFunction(() => !document.documentElement.hasAttribute("data-playground-terminal-folded"), null, { timeout: 3000 });
  const back = await terminalBox();
  assert.ok(Math.abs(back.height - taller.height) < 3, `back at the height it had (${back.height}, ${taller.height})`);
});

await step("Mod+B folds the Explorer away and back", async () => {
  await page.locator(".cm-content").click();
  await page.keyboard.press(`${mod}+b`);
  await page.waitForFunction(() => document.documentElement.hasAttribute("data-playground-explorer-folded"), null, { timeout: 3000 });
  assert.equal(await page.locator("[data-playground-explorer]").isVisible(), false);
  await shot(page, "06-explorer-folded");
  await page.keyboard.press(`${mod}+b`);
  await page.waitForFunction(() => !document.documentElement.hasAttribute("data-playground-explorer-folded"), null, { timeout: 3000 });
  assert.equal(await page.locator("[data-playground-explorer]").isVisible(), true);
});

await step("Ctrl+` goes to the terminal and back", async () => {
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+Backquote");
  await page.waitForFunction(() => Boolean(document.activeElement?.closest("[data-terminal]")), null, { timeout: 3000 });
  await page.keyboard.press("Control+Backquote");
  await page.waitForFunction(() => Boolean(document.activeElement?.closest(".cm-editor")), null, { timeout: 3000 });
});

await step("quick open (Mod+P) opens a file by its name", async () => {
  await page.keyboard.press(`${mod}+p`);
  await page.getByRole("combobox").fill("notes");
  await page.keyboard.press("Enter");
  await page.locator("[role=tab][aria-selected=true]", { hasText: "notes.txt" }).waitFor({ timeout: 5000 });
});

await step("a reload keeps the terminal's session and the layout, with nothing shown half restored", async () => {
  // A variable only this shell has.
  await typeInTerminal("export HU_MARK=kept-41; echo scrollback-marker-41");
  await waitForTerminal(/scrollback-marker-41/);
  // A layout of its own: the Explorer folded, the terminal as it was dragged.
  await page.locator(".cm-content").click();
  await page.keyboard.press(`${mod}+b`);
  await page.waitForTimeout(400);
  const height = (await terminalBox()).height;
  const tabs = await page.locator("[aria-label='Open files'] [role=tab]").allTextContents();
  await page.reload({ waitUntil: "commit" });
  const frames = [];
  for (let i = 0; i < 40; i++) {
    frames.push(
      await page
        .evaluate(() => {
          const d = document.documentElement;
          const pane = document.querySelector("[data-editor-pane]");
          const term = document.querySelector("[data-playground-terminal]");
          return {
            pane: Boolean(pane),
            hidden: d.hasAttribute("data-restore-editor") || (pane ? getComputedStyle(pane).visibility === "hidden" : true),
            explorerFolded: d.hasAttribute("data-playground-explorer-folded"),
            rail: Boolean(document.querySelector("nav[aria-label=Courses] a[href='/playground']")),
            tabs: [...document.querySelectorAll("[aria-label='Open files'] [role=tab]")].map((t) => t.textContent),
            terminal: term ? term.getBoundingClientRect().height : null,
          };
        })
        .catch(() => null)
    );
    await page.waitForTimeout(40);
  }
  await revealed();
  const painted = frames.filter((f) => f && f.pane);
  assert.ok(painted.length > 0, "it painted");
  assert.ok(painted.every((f) => f.explorerFolded), "the Explorer was folded from the first frame");
  assert.ok(painted.every((f) => f.rail), "the rail showed from the first frame");
  assert.ok(painted.every((f) => f.terminal === null || Math.abs(f.terminal - height) < 3), "the terminal had its height from the first frame");
  const shown = painted.filter((f) => !f.hidden);
  assert.ok(shown.every((f) => JSON.stringify(f.tabs) === JSON.stringify(tabs)), "never shown with other tabs");
  // The same shell, not a new one: it still has the variable.
  await page.locator("[data-terminal] .xterm-screen").first().waitFor({ timeout: 10000 });
  await page.waitForTimeout(1000);
  await typeInTerminal('echo "$HU_MARK-after-the-reload"');
  await waitForTerminal(/kept-41-after-the-reload/);
  await shot(page, "07-after-reload");
  await page.locator(".cm-content").click();
  await page.keyboard.press(`${mod}+b`);
  await page.waitForFunction(() => !document.documentElement.hasAttribute("data-playground-explorer-folded"), null, { timeout: 3000 });
});

await step("full screen hides the header, then covers the window, and Escape leaves it", async () => {
  const toggle = page.getByRole("button", { name: "Toggle full screen" });
  await toggle.click();
  await page.waitForFunction(() => document.documentElement.hasAttribute("data-semi"));
  await toggle.click();
  await page.waitForFunction(() => document.documentElement.hasAttribute("data-full"));
  const box = await page.locator("[data-workspace]").boundingBox();
  assert.ok(box && box.y === 0 && box.width === 1440, `covers the window (${JSON.stringify(box)})`);
  await shot(page, "08-full-screen");
  await row("README.md").focus();
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.documentElement.hasAttribute("data-full"));
});

await step("a phone shows one region at a time, with no sideways scroll", async () => {
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const p = await phone.newPage();
  await p.goto(`${base}/playground`, { waitUntil: "domcontentloaded" });
  await revealed(p);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/09-phone-code.png` });
  await p.getByRole("tab", { name: "Files" }).click();
  await p.locator("[role=treeitem][data-path='README.md']").click();
  await p.getByRole("tab", { name: "Terminal" }).click();
  await p.locator("[data-terminal] .xterm-screen").first().waitFor({ timeout: 15000 });
  await p.waitForTimeout(800);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/10-phone-terminal.png` });
  const scrollW = await p.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(scrollW <= 390, `no sideways scroll (${scrollW})`);
  await phone.close();
});

await step("no page errors", async () => {
  const real = errors.filter((e) => !/favicon|Failed to load resource/.test(e));
  for (const e of real) console.log("   page error:", e.slice(0, 300));
  assert.deepEqual(real, []);
});

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} steps passed`);
process.exit(failed.length ? 1 : 0);
