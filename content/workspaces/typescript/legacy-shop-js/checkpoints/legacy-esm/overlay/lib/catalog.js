// The product catalog, read once from data/products.json when the server starts.
import { readFileSync } from "node:fs";
import { join } from "node:path";

// import.meta.dirname is this file's folder, the ES module version of __dirname.
const products = JSON.parse(readFileSync(join(import.meta.dirname, "..", "data", "products.json"), "utf8"));

export function all() {
  return products;
}

export function find(sku) {
  return products.find(function (product) {
    return product.sku === sku;
  });
}
