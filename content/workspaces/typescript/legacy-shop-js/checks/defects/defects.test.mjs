// The Corner Shop's planted defects, checked from outside over HTTP, so the same tests run
// on every checkpoint whatever its module system or language. A test named "L4: ..." fails
// while defect L4 is planted, and every "works: ..." test must pass on every checkpoint.
// Together they show that a state has exactly the defects its checkpoint lists, no more.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

const PROJECT = join(import.meta.dirname, "..");
const started = [];

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/** A copy of the project, so each server writes its own data/orders.json. */
function copyProject(prepare = () => {}) {
  const dir = mkdtempSync(join(tmpdir(), "corner-shop-"));
  cpSync(PROJECT, dir, { recursive: true, filter: (src) => !/[/\\](node_modules|\.hu-checks|\.git)$/.test(src) });
  if (existsSync(join(PROJECT, "node_modules"))) symlinkSync(realpathSync(join(PROJECT, "node_modules")), join(dir, "node_modules"), "dir");
  prepare(dir);
  return dir;
}

/** Starts npm start in dir on a free port and waits until it answers. */
async function startShop(dir, env = {}) {
  const port = await freePort();
  const child = spawn("npm", ["start", "--silent"], {
    cwd: dir,
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", HU_FIXED_TIME: "2026-10-01T09:00:00Z", ...env },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  const base = `http://127.0.0.1:${port}`;
  started.push({ child, dir });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${base}/products`)).status === 200) return { base, dir };
    } catch {
      // not up yet
    }
    if (child.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`The shop did not start:\n${log}`);
}

async function call(base, method, path) {
  const res = await fetch(base + path, { method });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

async function addItems(base, cart, items) {
  for (const [sku, qty] of items) {
    const res = await call(base, "POST", `/cart/${cart}/items?sku=${sku}&qty=${qty}`);
    assert.equal(res.status, 200, `adding ${sku} to ${cart}: ${JSON.stringify(res.json)}`);
  }
}

let shop;
before(async () => {
  shop = await startShop(copyProject());
});
after(() => {
  for (const { child, dir } of started) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      // already gone
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

// ------------------------------------------------------------- what always works

test("works: the catalog lists the products", async () => {
  const res = await call(shop.base, "GET", "/products");
  assert.equal(res.status, 200);
  const milk = res.json.find((product) => product.sku === "P001");
  assert.equal(milk.name, "Oat Milk 1L");
  assert.equal(Number(milk.price), 2.99);
});

test("works: adding an item to a cart", async () => {
  await addItems(shop.base, "w1", [["P001", 2]]);
  const res = await call(shop.base, "GET", "/cart/w1");
  assert.equal(res.status, 200);
  assert.equal(res.json.items[0].sku, "P001");
  assert.equal(Number(res.json.items[0].qty), 2);
  assert.equal((await call(shop.base, "GET", "/cart/nobody")).status, 404);
});

test("works: totals for a simple cart", async () => {
  await addItems(shop.base, "w2", [["P001", 2]]);
  const res = await call(shop.base, "GET", "/cart/w2/totals?zip=94103");
  assert.equal(res.status, 200);
  assert.deepEqual(
    { subtotal: res.json.subtotal, discount: res.json.discount, tax: res.json.tax, shipping: res.json.shipping, total: res.json.total },
    { subtotal: "5.98", discount: "0.00", tax: "0.43", shipping: "7.50", total: "13.91" },
  );
});

test("works: an unknown product is 404 and an unknown zip is 400", async () => {
  assert.equal((await call(shop.base, "POST", "/cart/w3/items?sku=NOPE&qty=1")).status, 404);
  await addItems(shop.base, "w3", [["P001", 1]]);
  assert.equal((await call(shop.base, "GET", "/cart/w3/totals?zip=00000")).status, 400);
});

test("works: FIVEOFF takes $5 off $25 or more", async () => {
  await addItems(shop.base, "w4", [["P011", 3]]);
  assert.equal((await call(shop.base, "POST", "/cart/w4/coupon?code=FIVEOFF")).status, 200);
  const res = await call(shop.base, "GET", "/cart/w4/totals?zip=94103");
  assert.equal(res.json.discount, "5.00");
  assert.equal(res.json.total, "34.28");
});

test("works: FREESHIP makes shipping free", async () => {
  await addItems(shop.base, "w5", [["P001", 1]]);
  await call(shop.base, "POST", "/cart/w5/coupon?code=FREESHIP");
  assert.equal((await call(shop.base, "GET", "/cart/w5/totals?zip=94103")).json.shipping, "0.00");
});

test("works: checkout answers 201 with the order", async () => {
  await addItems(shop.base, "w6", [["P001", 1]]);
  const res = await call(shop.base, "POST", "/checkout/w6?zip=94103");
  assert.equal(res.status, 201);
  assert.equal(typeof res.json.id, "string");
  assert.equal(res.json.cartId, "w6");
  assert.equal(res.json.totals.total, "10.71");
  assert.equal((await call(shop.base, "POST", "/checkout/nobody?zip=94103")).status, 400);
});

// ------------------------------------------------------------- the planted defects

test("L1: quantities are numbers, so adding 2 and then 2 gives 4", async () => {
  await addItems(shop.base, "d1", [["P001", 2], ["P001", 2]]);
  const { json } = await call(shop.base, "GET", "/cart/d1");
  assert.equal(json.items[0].qty, 4);
  assert.equal((await call(shop.base, "POST", "/cart/d1b/items?sku=P001&qty=abc")).status, 400);
});

test("L2: an unknown coupon is refused instead of turning the totals into NaN", async () => {
  await addItems(shop.base, "d2", [["P001", 1]]);
  const coupon = await call(shop.base, "POST", "/cart/d2/coupon?code=NOPE");
  if (coupon.status !== 400) assert.equal((await call(shop.base, "GET", "/cart/d2/totals?zip=94103")).status, 400);
});

test("L3: a state with no tax rate is refused with 422", async () => {
  await addItems(shop.base, "d3", [["P001", 1]]);
  const res = await call(shop.base, "GET", "/cart/d3/totals?zip=99501");
  assert.equal(res.status, 422);
});

test("L4: shipping is free above $50, not for a $9 cart", async () => {
  await addItems(shop.base, "d4a", [["P002", 1], ["P006", 1], ["P020", 1]]);
  assert.equal((await call(shop.base, "GET", "/cart/d4a/totals?zip=94103")).json.shipping, "7.50");
  await addItems(shop.base, "d4b", [["P011", 12], ["P020", 1]]);
  assert.equal((await call(shop.base, "GET", "/cart/d4b/totals?zip=94103")).json.shipping, "0.00");
});

test("L5: a sale item's line uses its sale price", async () => {
  await addItems(shop.base, "d5", [["P012", 1]]);
  const { json } = await call(shop.base, "GET", "/cart/d5/totals?zip=94103");
  assert.deepEqual(json.lines, ["3.60"]);
});

test("L6: a failed order write is reported, not ignored", async () => {
  const broken = await startShop(
    copyProject((dir) => {
      rmSync(join(dir, "data", "orders.json"));
      mkdirSync(join(dir, "data", "orders.json"));
    }),
  );
  await addItems(broken.base, "d6", [["P001", 1]]);
  assert.equal((await call(broken.base, "POST", "/checkout/d6?zip=94103")).status, 500);
});

test("L7: working out the totals does not change the cart", async () => {
  await addItems(shop.base, "d7", [["P011", 1]]);
  await call(shop.base, "POST", "/cart/d7/coupon?code=SAVE10");
  const first = await call(shop.base, "GET", "/cart/d7/totals?zip=94103");
  const second = await call(shop.base, "GET", "/cart/d7/totals?zip=94103");
  assert.deepEqual(second.json, first.json);
});

test("L8: an expired coupon takes nothing off", async () => {
  await addItems(shop.base, "d8", [["P001", 1]]);
  const coupon = await call(shop.base, "POST", "/cart/d8/coupon?code=EXPIRED");
  if (coupon.status !== 400) assert.equal((await call(shop.base, "GET", "/cart/d8/totals?zip=94103")).json.discount, "0.00");
});

test("L9: money adds up exactly, in cents", async () => {
  await addItems(shop.base, "d9", [["P011", 1], ["P020", 10]]);
  assert.equal(String((await call(shop.base, "GET", "/cart/d9")).json.subtotal), "19.99");
});

test("L10: line totals are sorted as numbers", async () => {
  await addItems(shop.base, "d10", [["P002", 2], ["P005", 2], ["P011", 13]]);
  assert.deepEqual((await call(shop.base, "GET", "/cart/d10/totals?zip=94103")).json.lines, ["7.50", "11.00", "129.87"]);
});

test("L11: the order is on disk when checkout answers", async () => {
  const slow = await startShop(copyProject(), { HU_RACE_DELAY_MS: "300" });
  await addItems(slow.base, "d11", [["P001", 1]]);
  const res = await call(slow.base, "POST", "/checkout/d11?zip=94103");
  assert.equal(res.status, 201);
  const saved = JSON.parse(readFileSync(join(slow.dir, "data", "orders.json"), "utf8"));
  assert.ok(saved.some((order) => order.id === res.json.id));
});

test("L12: the catalog is checked when it loads: prices are numbers, and nothing without a price is for sale", async () => {
  const { json } = await call(shop.base, "GET", "/products");
  assert.ok(json.every((product) => typeof product.price === "number"));
  assert.ok(!json.some((product) => product.sku === "P019"));
  assert.equal((await call(shop.base, "POST", "/cart/d12/items?sku=P019&qty=1")).status, 404);
});
