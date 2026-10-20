// Orders, appended to data/orders.json. placeOrder adds the order and calls back with it.
const fs = require("fs");
const path = require("path");
const util = require("./util");

const ORDERS_FILE = path.join(__dirname, "..", "data", "orders.json");

function placeOrder(cart, totals, callback) {
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
      fs.writeFile(ORDERS_FILE, JSON.stringify(orders, null, 2) + "\n", function () {
        callback(null, order);
      });
    });
  });
}

module.exports = { placeOrder };
