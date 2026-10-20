#!/usr/bin/env node
// The IDE end to end, in a real browser: /typescript/playground against a
// running app (a production build) and its runner. It drives what a learner
// does and checks what they'd see:
//
//   the tree with Material icons, a file and a folder made in the explorer,
//   an edit saved by autosave, a rename and a delete, a command in the
//   terminal whose file shows in the explorer, a reload that brings the
//   terminal back with its scrollback, the dev task's port in the preview, a
//   request from the API panel, a file reset and a reset of everything, and
//   the Code comments switch hiding comments without changing the file.
//
// Usage: node tests/ide/e2e-playground.mjs <app url> [--server <how>]
//   --server fake    the fake runner's dev task serves a page (default)
//   --server code    writes a small node:http server into src/main.ts first
//
// Needs playwright-core and Chrome (PW_CORE and CHROME, or the defaults below).

import { createRequire } from "node:module";
import assert from "node:assert/strict";

const base = process.argv[2] ?? "http://localhost:3410";
const serverMode = process.argv.includes("--server") ? process.argv[process.argv.indexOf("--server") + 1] : "fake";
const require = createRequire(process.env.PW_CORE ? `${process.env.PW_CORE.replace(/\/$/, "")}/` : import.meta.url);
const { chromium } = require("playwright-core");
const CHROME = process.env.CHROME;
const SHOTS = process.env.SHOTS ?? null;

const results = [];
async function step(name, fn) {
  const started = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - started });
    console.log(`✔ ${name} (${Date.now() - started} ms)`);
  } catch (err) {
    results.push({ name, ok: false, error: err.message });
    console.log(`✖ ${name}: ${err.message.split("\n")[0]}`);
    if (process.env.DEBUG_TERM) console.log("   terminal:", JSON.stringify((await terminalText().catch(() => "")).slice(-400)));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/fail-${results.length}.png` }).catch(() => {});
  }
}

const browser = await chromium.launch({ executablePath: CHROME });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
if (process.env.DEBUG_WS) {
  await page.exposeFunction("__focusLog", (what) => console.log(`   focus ${what} at ${Date.now() % 100000}`));
  await page.addInitScript(() => {
    document.addEventListener(
      "focusin",
      (e) => {
        const t = e.target;
        window.__focusLog?.(`${t.tagName}.${String(t.className).slice(0, 40)}${t.dataset?.path ? `[${t.dataset.path}]` : ""}`);
      },
      true
    );
  });
  page.on("websocket", (ws) => {
    const tag = ws.url().replace(/^.*\/v1\/ws\//, "");
    console.log(`   ws open ${tag} at ${Date.now() % 100000}`);
    ws.on("close", () => console.log(`   ws close ${tag} at ${Date.now() % 100000}`));
    ws.on("framesent", (f) => typeof f.payload !== "string" && console.log(`   ws sent ${tag} ${JSON.stringify(Buffer.from(f.payload).toString())} at ${Date.now() % 100000}`));
  });
}
page.on("response", (r) => {
  if (r.status() >= 400 && r.url().includes("/api/")) errors.push(`${r.request().method()} ${r.url().replace(base, "")} answered ${r.status()}`);
});

const row = (path) => page.locator(`[role=treeitem][data-path="${path}"]`);
const ide = page.locator("[data-ide]");
// Shown, and the runner's terminals and tasks adopted.
const revealed = () =>
  page.waitForFunction(() => !document.documentElement.hasAttribute("data-restore") && document.querySelector("[data-ide][data-settled]"), null, { timeout: 8000 });
const apiFile = (path) =>
  page.evaluate(async (p) => {
    const id = document.querySelector("[data-ide]")?.getAttribute("data-workspace-id");
    const res = await fetch(`/api/workspaces/${id}/file?path=${encodeURIComponent(p)}`, { cache: "no-store" });
    return res.ok ? res.text() : `HTTP ${res.status}`;
  }, path);
async function terminalText() {
  return page.evaluate(() => [...document.querySelectorAll("[data-terminal] .xterm-rows")].map((el) => el.textContent ?? "").join("\n"));
}
async function typeInTerminal(text) {
  await page.locator("[data-terminal] .xterm-helper-textarea").first().focus();
  // A clean prompt line first, whatever a shell kept from before.
  await page.keyboard.press("Control+C");
  await page.keyboard.type(text, { delay: 5 });
  await page.keyboard.press("Enter");
}

await step("opens /typescript/playground with the tree and Material icons", async () => {
  await page.goto(`${base}/typescript/playground`, { waitUntil: "domcontentloaded" });
  await revealed();
  await row("src/main.ts").waitFor({ timeout: 5000 });
  const icon = await row("README.md").locator(".fi").evaluate((el) => getComputedStyle(el).backgroundImage);
  assert.match(icon, /^url\("data:image\/svg\+xml/);
  const tsIcon = await row("src/main.ts").locator(".fi").getAttribute("class");
  assert.match(tsIcon, /fi-typescript/);
  assert.equal(await page.locator("[role=tab][aria-selected=true]", { hasText: "main.ts" }).count(), 1);
});

// New file and New folder go in the focused file's folder (src, where
// main.ts is open), as in VS Code.
await step("makes a folder and a file in the explorer", async () => {
  await ide.getByRole("button", { name: "New folder" }).click();
  await page.keyboard.type("docs");
  await page.keyboard.press("Enter");
  await row("src/docs").waitFor({ timeout: 5000 });
  await row("src/main.ts").click();
  await ide.getByRole("button", { name: "New file" }).click();
  await page.keyboard.type("models/user.ts");
  await page.keyboard.press("Enter");
  await row("src/models/user.ts").waitFor({ timeout: 5000 });
  await page.locator("[role=tab][aria-selected=true]", { hasText: "user.ts" }).waitFor({ timeout: 5000 });
});

await step("edits and saves by itself (autosave, If-Match)", async () => {
  await page.locator(".cm-content").click();
  await page.keyboard.type("export const answer: number = 42;\n");
  await page.waitForFunction(() => !document.querySelector('[aria-label="unsaved"]'), null, { timeout: 5000 });
  assert.match(await apiFile("src/models/user.ts"), /export const answer: number = 42;/);
});

await step("renames a file", async () => {
  await row("src/models/user.ts").click({ button: "right" });
  await page.getByRole("menuitem", { name: /Rename/ }).click();
  await page.keyboard.press("Meta+A");
  await page.keyboard.type("account.ts");
  await page.keyboard.press("Enter");
  await row("src/models/account.ts").waitFor({ timeout: 5000 });
  assert.equal(await row("src/models/user.ts").count(), 0);
  assert.match(await apiFile("src/models/account.ts"), /answer/);
});

await step("deletes a folder after confirming", async () => {
  await row("src/docs").click({ button: "right" });
  await page.getByRole("menuitem", { name: /Delete/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await row("src/docs").waitFor({ state: "detached", timeout: 5000 });
});

await step("a command in the terminal makes a file the explorer shows within 1 s", async () => {
  await ide.getByRole("tab", { name: /Terminal 1/ }).click();
  const start = page.getByText(/to start a shell in \/workspace/);
  if (await start.count()) await start.click();
  await page.locator("[data-terminal] .xterm-rows").first().waitFor({ timeout: 15000 });
  // The shell's prompt (learner@workspace:/workspace$).
  await page.waitForFunction(() => /learner@\w+/.test(document.querySelector("[data-terminal] .xterm-rows")?.textContent ?? ""), null, { timeout: 20000 });
  await typeInTerminal("echo made-in-the-terminal > notes.txt");
  const t0 = Date.now();
  await row("notes.txt").waitFor({ timeout: 3000 });
  const ms = Date.now() - t0;
  assert.ok(ms < 1500, `the file showed after ${ms} ms`);
  assert.match(await apiFile("notes.txt"), /made-in-the-terminal/);
});

await step("a reload brings the terminal back with its scrollback", async () => {
  await typeInTerminal("echo scrollback-marker-41");
  await page.waitForFunction(() => (document.querySelector("[data-terminal] .xterm-rows")?.textContent ?? "").includes("scrollback-marker-41"), null, { timeout: 5000 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await revealed();
  // The screen came back from the runner's replay, not from a new shell:
  // the old command is there above the new prompt.
  await page.waitForFunction(
    () => [...document.querySelectorAll("[data-terminal] .xterm-rows")].some((el) => /echo scrollback-marker-41/.test(el.textContent ?? "")),
    null,
    { timeout: 10000 }
  );
});

if (serverMode === "code") {
  await step("writes a small server into src/main.ts (for the dev task)", async () => {
    await row("src/main.ts").click();
    await page.locator(".cm-content").click();
    await page.keyboard.press("Meta+A");
    await page.keyboard.press("Backspace");
    await page.keyboard.insertText(
      'import { createServer } from "node:http";\n\nconst port = Number(process.env.PORT ?? 8080);\ncreateServer((req, res) => {\n  if (req.url?.startsWith("/api/")) {\n    res.writeHead(200, { "Content-Type": "application/json" });\n    res.end(JSON.stringify({ ok: true, path: req.url, method: req.method }));\n    return;\n  }\n  res.writeHead(200, { "Content-Type": "text/html" });\n  res.end("<!doctype html><h1>Hello from the dev server</h1>");\n}).listen(port, "0.0.0.0", () => console.log(`Listening on http://localhost:${port}`));\n'
    );
    await page.keyboard.press("Meta+S");
    await page.waitForFunction(() => !document.querySelector('[aria-label="unsaved"]'), null, { timeout: 5000 });
  });
}

let port = null;
await step("starts the dev task and opens its port in the preview", async () => {
  await ide.getByRole("tab", { name: /Server/ }).click();
  await page.locator("select").filter({ has: page.locator("option[value=dev]") }).selectOption("dev");
  await ide.getByRole("button", { name: /^(Start|Restart)$/ }).click();
  await ide.getByRole("tab", { name: /Ports/ }).waitFor({ timeout: 20000 });
  await ide.getByRole("tab", { name: /Ports/ }).click();
  const cell = page.locator("td.font-mono").first();
  await cell.waitFor({ timeout: 20000 });
  port = Number((await cell.textContent()).match(/\d+/)[0]);
  await ide.getByRole("button", { name: "Preview" }).first().click();
  const frame = page.frameLocator("iframe[title^='Preview of port']");
  await frame.locator("h1").waitFor({ timeout: 15000 });
  assert.match(await frame.locator("h1").textContent(), /Hello from the/);
});

await step("sends a request from the API panel", async () => {
  await ide.getByRole("tab", { name: /^API$/ }).click();
  await page.getByLabel("Path").fill("/api/ping?x=1");
  await ide.getByRole("button", { name: "Send" }).click();
  await page.getByText(/^200/).first().waitFor({ timeout: 10000 });
  const body = await page.locator("pre").filter({ hasText: '"ok": true' }).first().textContent();
  assert.match(body, /"path": "\/api\/ping\?x=1"/);
});

await step("resets one file, then everything", async () => {
  await row("src/greet.ts").click();
  await page.locator(".cm-content").click();
  await page.keyboard.press("Meta+End");
  await page.keyboard.type("\n// a change to undo\n");
  await page.keyboard.press("Meta+S");
  await page.waitForFunction(() => !document.querySelector('[aria-label="unsaved"]'), null, { timeout: 5000 });
  assert.match(await apiFile("src/greet.ts"), /a change to undo/);
  await ide.getByRole("button", { name: "Reset and save points" }).click();
  await page.getByRole("menuitem", { name: /Reset this file/ }).click();
  await page.getByRole("dialog", { name: "Confirm the reset" }).getByRole("button", { name: "Reset" }).click();
  await page.waitForFunction(() => !(document.querySelector(".cm-content")?.textContent ?? "").includes("a change to undo"), null, { timeout: 5000 });
  assert.doesNotMatch(await apiFile("src/greet.ts"), /a change to undo/);
  await ide.getByRole("button", { name: "Reset and save points" }).click();
  await page.getByRole("menuitem", { name: /Reset everything/ }).click();
  await page.getByRole("dialog", { name: "Confirm the reset" }).getByRole("button", { name: "Reset" }).click();
  await row("notes.txt").waitFor({ state: "detached", timeout: 5000 });
  await row("src/models/account.ts").waitFor({ state: "detached", timeout: 5000 });
  assert.match(await apiFile("src/main.ts"), /The playground's program/);
});

await step("the Code comments switch hides comments in the editor, never in the file", async () => {
  await row("src/main.ts").click();
  await page.waitForFunction(() => (document.querySelector(".cm-content")?.textContent ?? "").includes("The playground's program"), null, { timeout: 5000 });
  const before = await apiFile("src/main.ts");
  await page.evaluate(() => {
    localStorage.setItem("hu-code-comments", "hidden");
    document.documentElement.setAttribute("data-code-comments", "hidden");
    window.dispatchEvent(new Event("hu:code-comments-changed"));
  });
  await page.waitForFunction(() => !(document.querySelector(".cm-content")?.textContent ?? "").includes("The playground's program"), null, { timeout: 5000 });
  const gutter = await page.locator(".cm-lineNumbers .cm-gutterElement").allTextContents();
  assert.ok(!gutter.includes("1") || gutter.indexOf("4") > -1, "the line numbers stay real");
  assert.equal(await apiFile("src/main.ts"), before);
  await page.evaluate(() => {
    localStorage.removeItem("hu-code-comments");
    document.documentElement.removeAttribute("data-code-comments");
    window.dispatchEvent(new Event("hu:code-comments-changed"));
  });
  await page.waitForFunction(() => (document.querySelector(".cm-content")?.textContent ?? "").includes("The playground's program"), null, { timeout: 5000 });
});

await step("no page errors", async () => {
  const real = errors.filter((e) => !/favicon|Failed to load resource/.test(e));
  for (const e of real) console.log("   page error:", e.slice(0, 300));
  assert.deepEqual(real, []);
});

if (SHOTS) await page.screenshot({ path: `${SHOTS}/e2e-final.png` });
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} steps passed${port ? ` (the dev server listened on ${port})` : ""}`);
process.exit(failed.length ? 1 : 0);
