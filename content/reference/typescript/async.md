# Async

An `async` function always returns a `Promise<T>`, and `await` unwraps it to `T`. The `Promise` helpers are typed from what you pass them, so `Promise.all` on two promises gives a tuple of their two results.

### Promise types

```typescript
type User = { id: number; name: string };

async function loadUser(id: number): Promise<User> {
  return { id, name: "Ada" };
}

const pending = loadUser(1);
//    ^? const pending: Promise<User>
const user = await pending;
//    ^? const user: User
console.log(user.name); // Ada
```

Forget the `await` and you hold the promise, not the value:

```typescript error
type User = { id: number; name: string };

async function loadUser(id: number): Promise<User> {
  return { id, name: "Ada" };
}

console.log(loadUser(1).name); // TS2339: Property 'name' does not exist on type 'Promise<User>'.
```

### Awaited and return types

```typescript
type A = Awaited<Promise<string>>;
//   ^? type A = string
type B = Awaited<Promise<Promise<number>>>;
//   ^? type B = number

async function loadConfig() {
  return { retries: 3, verbose: false };
}
type Config = Awaited<ReturnType<typeof loadConfig>>;
//   ^? type Config = { retries: number; verbose: boolean; }

const config: Config = await loadConfig();
console.log(config.retries); // 3
```

### Sleep, and make your own promise

```typescript
import { setTimeout as sleep } from "node:timers/promises";

const value = await sleep(10, "done"); // waits 10 ms, then gives its second argument
//    ^? const value: string
console.log(value); // done

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
await wait(10);

const { promise, resolve } = Promise.withResolvers<number>();
setTimeout(() => resolve(5), 10);
console.log(await promise); // 5
```

### Run several at once

```typescript
import { setTimeout as sleep } from "node:timers/promises";

const later = <T>(ms: number, value: T) => sleep(ms, value);

const [count, label] = await Promise.all([later(20, 3), later(10, "items")]);
//     ^? const count: number
console.log(count, label); // 3 items

const results = await Promise.allSettled([later(10, 1), Promise.reject(new Error("down"))]);
//    ^? const results: [PromiseSettledResult<number>, PromiseSettledResult<never>]
for (const r of results) {
  console.log(r.status === "fulfilled" ? `ok ${r.value}` : `failed ${String(r.reason)}`);
}
// ok 1
// failed Error: down

const first = await Promise.race([later(50, "slow"), later(10, "fast")]);
console.log(first); // fast

const winner = await Promise.any([Promise.reject(new Error("a")), later(10, "b")]);
console.log(winner); // b

try {
  await Promise.any([Promise.reject(new Error("timeout")), Promise.reject(new Error("503"))]);
} catch (err) {
  if (err instanceof AggregateError) console.log(err.errors.length); // 2
}
```

| Call | Resolves to | Rejects when |
| --- | --- | --- |
| `Promise.all([a, b])` | a tuple `[A, B]`, in input order | the first input rejects |
| `Promise.allSettled([a, b])` | a `PromiseSettledResult` per input, narrowed by `status` | never |
| `Promise.race([a, b])` | `A \| B`, the first to settle | the first to settle rejects |
| `Promise.any([a, b])` | `A \| B`, the first to fulfill | every input rejects, with an `AggregateError` |
| `Promise.withResolvers<T>()` | returns `{ promise, resolve, reject }`, and `promise` settles when you call one | you call `reject` |
| `Promise.try(fn, ...args)` | `fn(...args)`, awaited | `fn` throws, even synchronously |

### One at a time, or all together

```typescript
import { setTimeout as sleep } from "node:timers/promises";

async function price(sku: string): Promise<number> {
  await sleep(10);
  return sku.length * 100;
}

const skus = ["MUG", "KETTLE"];
const inOrder: number[] = [];
for (const sku of skus) inOrder.push(await price(sku)); // waits for each before the next
const together = await Promise.all(skus.map(price));    // starts both, then waits once
//    ^? const together: number[]
console.log(inOrder.join(" "), together.join(" ")); // 300 600 300 600
```

### Timeouts and cancellation with AbortSignal

```typescript
import { setTimeout as sleep } from "node:timers/promises";

try {
  await sleep(1000, undefined, { signal: AbortSignal.timeout(20) });
} catch (err) {
  if (err instanceof Error) console.log(err.name); // AbortError
}

const controller = new AbortController();
controller.abort("user left");
console.log(controller.signal.aborted, controller.signal.reason); // true user left

const either = AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]);
console.log(either.aborted); // true
```

Take a `signal` in your own functions, and check it between steps:

```typescript
async function buildReport(signal: AbortSignal): Promise<string> {
  const done: string[] = [];
  for (const step of ["load", "sum", "format"]) {
    signal.throwIfAborted(); // throws signal.reason once it is aborted
    done.push(step);
  }
  return done.join(" > ");
}

console.log(await buildReport(new AbortController().signal)); // load > sum > format

const stop = new AbortController();
stop.abort(new Error("cancelled by user"));
await buildReport(stop.signal).catch((err) => console.log(String(err))); // Error: cancelled by user
```

A typed timeout helper:

```typescript
import { setTimeout as sleep } from "node:timers/promises";

async function withTimeout<T>(work: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T | "timeout"> {
  const signal = AbortSignal.timeout(ms);
  try {
    return await work(signal);
  } catch (err) {
    if (signal.aborted) return "timeout";
    throw err;
  }
}

const fast = await withTimeout((signal) => sleep(10, 42, { signal }), 100);
//    ^? const fast: number | "timeout"
console.log(fast); // 42
console.log(await withTimeout((signal) => sleep(500, 42, { signal }), 20)); // timeout
```

### Async generators

```typescript
import { setTimeout as sleep } from "node:timers/promises";

async function* countdown(from: number): AsyncGenerator<number> {
  for (let n = from; n > 0; n--) {
    await sleep(5);
    yield n;
  }
}

for await (const n of countdown(3)) {
  console.log(n);
  if (n === 2) break; // stops the generator too
}
// 3
// 2

const all = await Array.fromAsync(countdown(3));
//    ^? const all: number[]
console.log(all.join(" ")); // 3 2 1
```

| Type | Means |
| --- | --- |
| `Promise<T>` | a `T`, later |
| `Awaited<T>` | what `await` gives for a `T`, with nested promises unwrapped |
| `PromiseSettledResult<T>` | `{ status: "fulfilled"; value: T } \| { status: "rejected"; reason: any }` |
| `AsyncGenerator<T, TReturn, TNext>` | what an `async function*` returns |
| `AsyncIterable<T>` | anything `for await` can loop over |
| `AbortSignal` | a cancel flag: `aborted`, `reason`, `throwIfAborted()`, and an `"abort"` event |

### Gotchas

- `tsc` doesn't flag a promise nobody awaits: `save(order);` alone runs, but nothing waits for it or sees its error. ESLint's `no-floating-promises` catches it.
- `items.map(async (x) => ...)` gives an array of promises, and `forEach(async ...)` waits for nothing. Use `Promise.all(items.map(...))` or a `for...of` loop with `await`.
- `reason` in `allSettled` and `errors` in an `AggregateError` are `any`. Narrow them like a caught error.
- `Promise.race` and timeouts don't stop the losing work. Pass an `AbortSignal` so the work can stop itself.
