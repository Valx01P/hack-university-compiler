import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import {
  getCategory,
  getProductBySlug,
  listCategories,
  listProducts,
  listProductsInCategory,
} from "../lib/catalog.ts";

const publicFile = (path: string) => new URL(`../public${path}`, import.meta.url);

test("the catalog has 12 products, three in each of 4 categories", () => {
  assert.equal(listProducts().length, 12);
  assert.deepEqual(
    listCategories().map((category) => category.slug),
    ["packs", "tents", "apparel", "cooking"],
  );
  for (const category of listCategories()) {
    assert.equal(listProductsInCategory(category.slug).length, 3, category.slug);
  }
});

test("slugs are unique", () => {
  const slugs = listProducts().map((product) => product.slug);
  assert.equal(new Set(slugs).size, slugs.length);
});

test("seven products cost $100.00 or less", () => {
  assert.equal(listProducts().filter((product) => product.priceCents <= 10000).length, 7);
});

test("only the hip pack and the alpine tent are out of stock", () => {
  const soldOut = listProducts().filter((product) => !product.inStock).map((product) => product.slug);
  assert.deepEqual(soldOut, ["hip-pack-5", "alpine-1p-tent"]);
});

test("lookups find known slugs and return undefined for unknown ones", () => {
  const tent = getProductBySlug("ridge-2p-tent");
  assert.equal(tent?.name, "Ridge 2P Tent");
  assert.equal(tent?.priceCents, 34900);
  assert.equal(tent?.specs.weight, "1.8 kg");
  assert.equal(getProductBySlug("no-such-product"), undefined);
  assert.equal(getCategory("tents")?.title, "Tents");
  assert.equal(getCategory("boats"), undefined);
});

test("listProducts returns a copy, so callers cannot reorder the catalog", () => {
  const products = listProducts();
  products.reverse();
  assert.equal(listProducts()[0].slug, "trail-pack-45");
});

test("every product photo and category banner exists in public/", () => {
  for (const product of listProducts()) {
    assert.ok(existsSync(publicFile(product.image)), product.image);
  }
  for (const category of listCategories()) {
    assert.ok(existsSync(publicFile(category.banner)), category.banner);
  }
});
