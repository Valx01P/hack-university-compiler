// Tests for src/storage/json-store.ts against real files in a temporary folder, so they
// never touch data/inventory.json.
import assert from "node:assert/strict";
import { copyFile, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { CliError } from "../src/errors.ts";
import { loadInventory, saveInventory } from "#storage/json-store.ts";

const FIXTURES = join(import.meta.dirname, "..", "fixtures");
let dir = "";

before(async () => {
  dir = await mkdtemp(join(tmpdir(), "stockroom-"));
});

after(async () => {
  await rm(dir, { recursive: true, force: true });
});

test("loads the seed file", async () => {
  const inventory = await loadInventory(join(FIXTURES, "seed.json"));
  assert.equal(inventory.items.length, 12);
  assert.deepEqual(inventory.items[0], {
    sku: "MUG-001",
    name: "Ceramic Mug",
    category: "kitchen",
    qty: 24,
    priceCents: 1299,
    updatedAt: "2026-09-30T17:00:00.000Z",
  });
});

test("upgrades a version 1 file, with text prices, to version 2", async () => {
  const inventory = await loadInventory(join(FIXTURES, "inventory-v1.json"));
  assert.equal(inventory.version, 2);
  assert.deepEqual(
    inventory.items.map((item) => [item.sku, item.priceCents]),
    [["MUG-001", 1299], ["PEN-010", 899], ["SEE-101", 350]],
  );
});

test("saves through a temporary file and leaves none behind", async () => {
  const path = join(dir, "inventory.json");
  await copyFile(join(FIXTURES, "seed.json"), path);
  const inventory = await loadInventory(path);
  await saveInventory(path, { version: 2, items: inventory.items.slice(0, 2) });
  assert.equal((await loadInventory(path)).items.length, 2);
  assert.deepEqual(await readdir(dir), ["inventory.json"]);
});

test("rejects a broken file", async () => {
  await assert.rejects(loadInventory(join(FIXTURES, "broken.json")), (error: unknown) => {
    assert.ok(error instanceof CliError);
    assert.match(error.message, /does not look like a Stockroom inventory/);
    return true;
  });
});

test("rejects a duplicate SKU", async () => {
  const path = join(dir, "duplicate.json");
  const { items } = await loadInventory(join(FIXTURES, "seed.json"));
  await writeFile(path, JSON.stringify({ version: 2, items: [...items, items[0]] }));
  await assert.rejects(loadInventory(path), /does not look like a Stockroom inventory/);
});
