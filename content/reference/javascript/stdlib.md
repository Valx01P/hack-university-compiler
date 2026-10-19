# Standard Library

Globals like `JSON`, `Math`, `Date`, `Intl`, and `structuredClone` need no import. Node's own modules come in with `require("name")`: `util`, `assert`, `crypto`, `path`, `events`, `fs`. There is no built-in heap, deque, or sorted map, so you write the small ones yourself.

### JSON

```javascript
const data = { name: "ann", tags: ["a", "b"], score: 9.5 };
const text = JSON.stringify(data);    // '{"name":"ann","tags":["a","b"],"score":9.5}'
JSON.stringify(data, null, 2);        // pretty-printed, 2-space indent
const back = JSON.parse(text);
back.tags[1];                         // 'b'
```

### Dates

```javascript
const now = new Date();
const d = new Date(2024, 0, 31);       // months are 0-based: 0 is January
d.getFullYear();                       // 2024
d.getMonth();                          // 0
d.getDate();                           // 31, day of the month
d.getDay();                            // 3, day of the week (0 is Sunday)

const t = new Date("2024-03-15T12:00:00Z");
t.toISOString();                       // '2024-03-15T12:00:00.000Z'
t.getTime();                           // 1710504000000, ms since 1970
Date.now();                            // current time in ms

const next = new Date(d);
next.setDate(next.getDate() + 1);      // Feb 1, rolls over the month
const days = (new Date(2024, 2, 1) - new Date(2024, 1, 1)) / 86400000;  // 29
```

### util and assert

```javascript error
const util = require("util");
const nested = { a: { b: { c: { d: 1 } } } };
console.log(util.inspect(nested, { depth: null }));     // every level, no [Object]
util.isDeepStrictEqual([1, { a: 2 }], [1, { a: 2 }]);  // true

const assert = require("assert");
assert.strictEqual(1 + 1, 2);                    // silent when it holds
assert.deepStrictEqual([1, 2], [1, 2]);          // compares contents
assert.ok(false, "bad");                         // throws AssertionError: bad
```

### Random, hashing, timing

```javascript
const crypto = require("crypto");
crypto.randomInt(1, 7);               // 1 to 6, end is exclusive
crypto.randomUUID();                  // 36-char id
crypto.createHash("sha256").update("hi").digest("hex");  // '8f4343...'

const t0 = performance.now();         // global in Node 20
// ... work ...
const ms = performance.now() - t0;
console.time("loop");                 // or: label a timer
console.timeEnd("loop");              // loop: 0.051ms
```

### Paths, events, timers

```javascript
const path = require("path");
path.join("a", "b", "../c.txt");      // 'a/c.txt'
path.extname("x.tar.gz");             // '.gz'

const { EventEmitter } = require("events");
const em = new EventEmitter();
em.on("hit", (n) => console.log("hit", n));
em.emit("hit", 3);                    // hit 3

setTimeout(() => console.log("later"), 0);   // runs after the current code
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
async function main() {
  await sleep(100);                   // no top-level await in CommonJS
  const [a, b] = await Promise.all([sleep(5).then(() => 1), Promise.resolve(2)]);
  console.log(a, b);                  // 1 2
}
main();
```

### Queue without shift

`arr.shift()` is O(n). For a BFS queue, keep a head index.

```javascript
const graph = { a: ["b", "c"], b: ["d"], c: ["d"], d: [] };
const queue = ["a"];
const seen = new Set(queue);
let head = 0;
while (head < queue.length) {
  const node = queue[head++];
  for (const next of graph[node]) {
    if (!seen.has(next)) {
      seen.add(next);
      queue.push(next);
    }
  }
}
console.log(queue.join(" ")); // a b c d (visit order)
```

### Priority queue (binary heap)

```javascript
class MinHeap {
  constructor(less = (a, b) => a < b) {
    this.items = [];
    this.less = less;
  }
  get size() {
    return this.items.length;
  }
  push(x) {
    const h = this.items;
    h.push(x);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;             // parent
      if (!this.less(h[i], h[p])) break;
      [h[i], h[p]] = [h[p], h[i]];
      i = p;
    }
  }
  pop() {
    const h = this.items;
    const top = h[0];
    const last = h.pop();
    if (h.length === 0) return top;
    h[0] = last;
    let i = 0;
    while (true) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < h.length && this.less(h[l], h[m])) m = l;
      if (r < h.length && this.less(h[r], h[m])) m = r;
      if (m === i) return top;
      [h[i], h[m]] = [h[m], h[i]];
      i = m;
    }
  }
}

const heap = new MinHeap();
for (const x of [5, 1, 4, 2]) heap.push(x);
heap.pop();                                             // 1
const tasks = new MinHeap((a, b) => a[0] < b[0]);      // [priority, name] pairs
tasks.push([2, "write"]);
tasks.push([1, "plan"]);
tasks.pop()[1];                                         // 'plan'
```

| Call | Does |
| --- | --- |
| `JSON.stringify(v, null, 2)` | value to JSON text, pretty with the indent |
| `JSON.parse(s)` | JSON text to a value, throws `SyntaxError` on bad input |
| `util.inspect(v, { depth: null })` | full text of a nested value |
| `assert.deepStrictEqual(a, b)` | throws unless the contents match |
| `crypto.randomInt(lo, hi)` | random integer, `hi` excluded |
| `path.join(...parts)` | join path pieces |
| `Object.groupBy`, `Set.prototype.union` | not available here |

### Gotchas

- `JSON.stringify` drops `undefined` and functions, turns `NaN` into `null`, and turns a `Date` into an ISO string that `JSON.parse` does not turn back.
- `new Date(2024, 1, 1)` is February. Months count from 0, days of the month from 1.
- `new Date("2024-03-15")` is midnight UTC, but `new Date(2024, 2, 15)` is midnight local time.
- `setTimeout(fn, 0)` and `await` run after the rest of the current code, so output can come in a different order than the lines.
