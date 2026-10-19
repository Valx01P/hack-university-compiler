# Typed Node APIs

`@types/node` types every `node:` module, so an import like `node:fs/promises` comes fully typed. What crosses an edge still arrives loose (file contents, `process.env`, SQL rows, request bodies), so check it there.

### Files with fs/promises

```typescript
import { appendFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";

await mkdir("data", { recursive: true });
await writeFile("data/notes.txt", "one\ntwo\n");
await appendFile("data/notes.txt", "three\n");

const text = await readFile("data/notes.txt", "utf8");
//    ^? const text: string
const bytes = await readFile("data/notes.txt");
//    ^? const bytes: NonSharedBuffer
console.log(text.split("\n").length, bytes.length); // 4 14
console.log(await readdir("data")); // [ 'notes.txt' ]
```

A failed call throws an error with a `code`. Narrow it with a type guard:

```typescript
import { readFile } from "node:fs/promises";

function isErrnoError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}

try {
  await readFile("missing.json", "utf8");
} catch (err) {
  if (isErrnoError(err) && err.code === "ENOENT") console.log("no such file"); // no such file
  else throw err;
}
```

### Paths

```typescript
import path from "node:path";

console.log(path.join("src", "lib", "../main.ts"));          // src/main.ts
console.log(path.resolve("/srv", "app", "main.ts"));         // /srv/app/main.ts
console.log(path.basename("/srv/app/main.ts", ".ts"));       // main
console.log(path.extname("report.test.ts"));                 // .ts
console.log(path.relative("/srv/app", "/srv/data/x.json"));  // ../data/x.json
console.log(import.meta.dirname);  // /work
console.log(import.meta.filename); // /work/main.ts
```

### Command-line options with parseArgs

```typescript
import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({
  args: ["report.csv", "--limit", "5", "-v"], // leave args out to read process.argv
  options: {
    limit: { type: "string", short: "n" },
    verbose: { type: "boolean", short: "v", default: false },
  },
  allowPositionals: true,
});
console.log(values.limit, values.verbose, positionals); // 5 true [ 'report.csv' ]
//                 ^? (property) limit?: string | undefined
//                               ^? (property) verbose: boolean

try {
  parseArgs({ args: ["--lmit", "5"], options: { limit: { type: "string" } } });
} catch (err) {
  if (err instanceof Error) console.log(err.message); // Unknown option '--lmit'
}
```

### A typed EventEmitter

```typescript
import { EventEmitter } from "node:events";

type Order = { id: number; total: number };
type OrderEvents = {
  created: [order: Order];
  failed: [id: number, reason: string];
};

const events = new EventEmitter<OrderEvents>();
events.on("created", (order) => console.log(`order ${order.id}: ${order.total}`));
events.on("failed", (id, reason) => console.log(`order ${id} failed: ${reason}`));
events.emit("created", { id: 1, total: 25 }); // order 1: 25
events.emit("failed", 2, "card declined");    // order 2 failed: card declined
```

```typescript harness
import { EventEmitter } from "node:events";

type Order = { id: number; total: number };
const events = new EventEmitter<{ created: [order: Order] }>();
{{code}}
```

```typescript error
events.emit("created", 1); // TS2345: Argument of type 'number' is not assignable to parameter of type 'Order'.
```

### node:test and assert

```typescript
import assert from "node:assert/strict";
import { mock } from "node:test";

assert.equal(2 + 3, 5);
assert.deepEqual({ tags: ["a"] }, { tags: ["a"] });
assert.throws(() => JSON.parse("{"), SyntaxError);
await assert.rejects(Promise.reject(new Error("boom")), /boom/);

const notify = mock.fn((message: string) => message.length);
notify("saved");
notify("shipped");
console.log(notify.mock.callCount(), notify.mock.calls[1]?.arguments[0]); // 2 shipped
```

A test file, run with `node --test` (it finds `*.test.ts` files):

```typescript types
import { describe, it } from "node:test";
import assert from "node:assert/strict";

function total(prices: readonly number[]): number {
  return prices.reduce((sum, p) => sum + p, 0);
}

describe("total", () => {
  it("adds prices", () => {
    assert.equal(total([250, 125]), 375);
  });
  it("is 0 for an empty cart", () => {
    assert.equal(total([]), 0);
  });
});
```

### SQLite rows with node:sqlite

```typescript
import { DatabaseSync, type SQLOutputValue } from "node:sqlite"; // a column value: null, number, bigint, string, or bytes
import * as z from "zod";

const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT NOT NULL, qty INTEGER NOT NULL)");
const insert = db.prepare("INSERT INTO items (name, qty) VALUES (?, ?)");
insert.run("bolt", 40);
insert.run("nut", 15);

const row = db.prepare("SELECT id, name, qty FROM items WHERE name = ?").get("nut");
//    ^? const row: Record<string, SQLOutputValue> | undefined
console.log(row); // [Object: null prototype] { id: 2, name: 'nut', qty: 15 }

const Item = z.object({ id: z.number(), name: z.string(), qty: z.number() });
const items = z.array(Item).parse(db.prepare("SELECT id, name, qty FROM items ORDER BY id").all());
//    ^? const items: { id: number; name: string; qty: number; }[]
console.log(items.map((i) => `${i.name}=${i.qty}`).join(", ")); // bolt=40, nut=15
```

### HTTP with node:http

```typescript
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { json } from "node:stream/consumers";

const server = createServer(async (req, res) => {
  //                               ^? (parameter) req: IncomingMessage
  const body = req.method === "POST" ? await json(req) : null;
  //    ^? const body: unknown
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ method: req.method, url: req.url, body }));
});

function portOf(server: Server): number {
  const address = server.address();
  //    ^? const address: string | AddressInfo | null
  if (address === null || typeof address === "string") throw new Error("not listening on a port");
  return address.port;
}

server.listen(0, "127.0.0.1"); // port 0: any free port
await once(server, "listening");
const res = await fetch(`http://127.0.0.1:${portOf(server)}/orders`, { method: "POST", body: '{"sku":"MUG"}' });
const data: unknown = await res.json();
console.log(res.status, JSON.stringify(data)); // 200 {"method":"POST","url":"/orders","body":{"sku":"MUG"}}
server.close();
```

| Value | Type |
| --- | --- |
| `req.method`, `req.url` | `string \| undefined` |
| `req.headers["content-type"]` | `string \| undefined` |
| `req.headers["x-api-key"]` | `string \| string[] \| undefined` |
| `new URL(req.url ?? "/", "http://localhost").searchParams.get("limit")` | `string \| null` |
| `await json(req)` from `node:stream/consumers` | `unknown` |
| `await res.json()` from `fetch` | `any`, so store it as `unknown` |
| `server.address()` | `string \| AddressInfo \| null` |

### process.env

```typescript
import * as z from "zod";

const port = process.env.PORT;
//    ^? const port: string | undefined
console.log(port ?? "PORT is not set"); // PORT is not set

const Env = z.object({
  PORT: z.coerce.number().int().default(8080),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});
const env = Env.parse(process.env);
console.log(env.PORT, env.NODE_ENV); // 8080 development
```

Load a `.env` file with `node --env-file=.env main.ts`, or call `process.loadEnvFile(".env")` first thing.

### Gotchas

- `readFile(path)` without an encoding gives a `Buffer`. Pass `"utf8"` to get a `string`.
- Relative paths resolve from `process.cwd()`, wherever the program was started. Build paths from `import.meta.dirname` to reach files next to your code.
- `node:sqlite` rows are `Record<string, SQLOutputValue>` and print as `[Object: null prototype]`. Parse them with a schema before they reach your domain code.
- Every `process.env` value is a `string` or `undefined`: `"false"` is truthy, and `"8080"` isn't a number until you parse it.
