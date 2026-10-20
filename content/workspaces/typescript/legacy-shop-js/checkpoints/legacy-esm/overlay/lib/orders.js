// Orders, appended to data/orders.json. placeOrder adds the order and calls back with it.
import fs from "node:fs";
import { join } from "node:path";
import * as util from "./util.js";

const ORDERS_FILE = join(import.meta.dirname, "..", "data", "orders.json");

export function placeOrder(cart, totals, callback) {
  fs.readFile(ORDERS_FILE, "utf8", function (err, text) {
    const orders = err ? [] : JSON.parse(text);
    const order = {
      id: "o" + (orders.length + 1),
      cartId: cart.id,
      items: util.deepClone(cart.items),
      totals: totals,
      placedAt: new Date().toISOString(),
    };
    orders.push(order);
    util.raceWindow(function () {
      fs.writeFile(ORDERS_FILE, JSON.stringify(orders, null, 2) + "\n", function () {});
    });
    callback(null, order);
  });
}
