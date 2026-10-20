// The product catalog, read once from data/products.json when the server starts.
const fs = require("fs");
const path = require("path");

const products = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "products.json"), "utf8"));

function all() {
  return products;
}

function find(sku) {
  return products.find(function (product) {
    return product.sku === sku;
  });
}

module.exports = { all, find };
