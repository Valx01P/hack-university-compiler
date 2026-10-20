// End-to-end tests: each one runs `node src/cli.ts` as a child process, the way you run it
// in the terminal, against a fresh copy of fixtures/seed.json and a frozen clock. They
// check what a user sees: stdout, stderr, the exit code, and the file left behind.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { promisify } from "node:util";

const PROJECT = join(import.meta.dirname, "..");
const run = promisify(execFile);
let dir = "";
let data = "";

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "stockroom-cli-"));
  data = join(dir, "inventory.json");
  await copyFile(join(PROJECT, "fixtures", "seed.json"), data);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** Runs the CLI and resolves to what it printed and its exit code, even when it fails. */
async function cli(...args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  const env = { ...process.env, STOCKROOM_DATA: data, STOCKROOM_LOW_STOCK: "5", HU_FIXED_TIME: "2026-10-01T09:00:00Z" };
  try {
    const { stdout, stderr } = await run(process.execPath, ["src/cli.ts", ...args], { cwd: PROJECT, env });
    return { stdout, stderr, code: 0 };
  } catch (error) {
    if (error instanceof Error && "code" in error && typeof error.code === "number" && "stdout" in error && "stderr" in error) {
      return { stdout: String(error.stdout), stderr: String(error.stderr), code: error.code };
    }
    throw error;
  }
}

test("list prints every item as a table", async () => {
  const { stdout, code } = await cli("list");
  assert.equal(code, 0);
  const lines = stdout.trimEnd().split("\n");
  assert.equal(lines.length, 13);
  assert.equal(lines[0], "SKU      Name               Category  Qty    Price");
  assert.equal(lines[7], "CHR-001  Office Chair       office      0  $189.00");
});

test("list --low shows the items at or below the threshold", async () => {
  const { stdout } = await cli("list", "--low");
  assert.equal(
    stdout,
    [
      "SKU      Name               Category  Qty    Price",
      "MUG-002  Travel Mug         kitchen     3   $24.50",
      "NTB-004  Dot Grid Notebook  office      2   $14.50",
      "CHR-001  Office Chair       office      0  $189.00",
      "GLV-003  Garden Gloves      garden      4   $11.99",
      "",
    ].join("\n"),
  );
});

test("report --format csv totals each category", async () => {
  const { stdout } = await cli("report", "--format", "csv");
  assert.equal(stdout, "category,items,units,value\nkitchen,3,34,805.19\noffice,5,147,1587.55\ngarden,4,66,488.84\ntotal,12,247,2881.58\n");
});

test("add saves the new item with the clock's time", async () => {
  const { stdout } = await cli("add", "MUG-003", "--name", "Espresso Cup", "--qty", "6", "--price", "4.5", "--category", "kitchen");
  assert.equal(stdout, "Added MUG-003 Espresso Cup: 6 at $4.50 (kitchen)\n");
  const saved: unknown = JSON.parse(await readFile(data, "utf8"));
  assert.ok(typeof saved === "object" && saved !== null && "items" in saved && Array.isArray(saved.items));
  assert.deepEqual(saved.items.at(-1), {
    sku: "MUG-003",
    name: "Espresso Cup",
    category: "kitchen",
    qty: 6,
    priceCents: 450,
    updatedAt: "2026-10-01T09:00:00.000Z",
  });
});

test("adjust prints the movement, and refuses to go below zero", async () => {
  assert.equal((await cli("adjust", "MUG-001", "-3", "--reason", "sale")).stdout, "MUG-001: 24 -> 21 (sale)\n");
  const refused = await cli("adjust", "MUG-001", "-30", "--reason", "sale");
  assert.equal(refused.code, 2);
  assert.equal(refused.stderr, "Cannot remove 30 from MUG-001: only 21 in stock\n");
});

test("remove of a SKU the inventory does not have exits with 3", async () => {
  const { stderr, code } = await cli("remove", "NOPE-000");
  assert.equal(code, 3);
  assert.equal(stderr, "No item with SKU NOPE-000\n");
});

test("an unknown command or option exits with 2", async () => {
  assert.equal((await cli("frobnicate")).code, 2);
  const typo = await cli("list", "--lwo");
  assert.equal(typo.code, 2);
  assert.match(typo.stderr, /Unknown option '--lwo'/);
});
