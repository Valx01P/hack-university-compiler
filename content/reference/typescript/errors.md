# Errors

JavaScript can throw any value, so the variable a `catch` receives is `unknown` in TypeScript. Narrow it with `instanceof` or `Error.isError` before you read `.message`.

### catch gives you unknown

```typescript error
try {
  JSON.parse("{bad");
} catch (err) {
  console.log(err.message); // TS18046: 'err' is of type 'unknown'.
}
```

```typescript
try {
  JSON.parse("{bad");
} catch (err) {
  if (err instanceof SyntaxError) console.log(`bad JSON: ${err.message}`);
  else throw err; // rethrow what you don't handle
}
// bad JSON: Expected property name or '}' in JSON at position 1 (line 1 column 2)
```

### Error.isError and a message helper

```typescript
import vm from "node:vm";

function toMessage(err: unknown): string {
  return Error.isError(err) ? err.message : String(err);
}

console.log(toMessage(new RangeError("too big"))); // too big
console.log(toMessage("plain text"));               // plain text

const foreign = vm.runInNewContext("new Error('from another realm')");
console.log(foreign instanceof Error, Error.isError(foreign)); // false true
console.log(Error.isError({ name: "Error", message: "fake" })); // false
```

### Custom errors

```typescript
class NotFoundError extends Error {
  override readonly name = "NotFoundError";
  readonly resource: string;
  readonly id: string;

  constructor(resource: string, id: string) {
    super(`${resource} ${id} not found`);
    this.resource = resource;
    this.id = id;
  }
}

try {
  throw new NotFoundError("order", "ord_0042");
} catch (err) {
  if (err instanceof NotFoundError) console.log(err.resource, err.id); // order ord_0042
  console.log(String(err)); // NotFoundError: order ord_0042 not found
}
```

A code union instead of a class per error:

```typescript
type ErrorCode = "NOT_FOUND" | "CONFLICT" | "INVALID";

class AppError extends Error {
  override readonly name = "AppError";
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
  }
}

function httpStatus(err: AppError): 404 | 409 | 422 {
  switch (err.code) {
    case "NOT_FOUND":
      return 404;
    case "CONFLICT":
      return 409;
    case "INVALID":
      return 422;
  }
}

console.log(httpStatus(new AppError("CONFLICT", "order is already paid"))); // 409
```

### Wrap an error with a cause

```typescript
function loadConfig(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error("could not load config", { cause: err });
  }
}

try {
  loadConfig("{");
} catch (err) {
  for (let e: unknown = err; Error.isError(e); e = e.cause) console.log(e.message);
}
// could not load config
// Expected property name or '}' in JSON at position 1 (line 1 column 2)
```

### Errors from promises

```typescript
async function charge(cents: number): Promise<string> {
  if (cents <= 0) throw new RangeError(`bad amount: ${cents}`);
  return `charged ${cents}`;
}

try {
  console.log(await charge(500)); // charged 500
  await charge(0);
} catch (err) {
  if (err instanceof RangeError) console.log(err.message); // bad amount: 0
}

await charge(-1).catch((err: unknown) => console.log(String(err))); // RangeError: bad amount: -1
```

### Return a Result instead of throwing

```typescript
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

function parseQuantity(text: string): Result<number, string> {
  const n = Number(text);
  if (!Number.isInteger(n) || n < 1 || n > 99) return err(`not a quantity: ${text}`);
  return ok(n);
}

for (const text of ["3", "0", "x"]) {
  const r = parseQuantity(text);
  console.log(r.ok ? `ok ${r.value}` : `error: ${r.error}`);
}
// ok 3
// error: not a quantity: 0
// error: not a quantity: x
```

Callers can't reach `value` until they check `ok`:

```typescript error
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

declare function parseQuantity(text: string): Result<number, string>;

console.log(parseQuantity("3").value); // TS2339: Property 'value' does not exist on type 'Result<number, string>'.
```

### Cleanup with using

`using` calls `[Symbol.dispose]()` when the block ends, even when it throws:

```typescript
class TempDir implements Disposable {
  readonly path: string;

  constructor(path: string) {
    this.path = path;
    console.log(`created ${path}`);
  }

  [Symbol.dispose](): void {
    console.log(`removed ${this.path}`);
  }
}

try {
  using dir = new TempDir("/tmp/job");
  console.log(`working in ${dir.path}`);
  throw new Error("disk full");
} catch (err) {
  if (err instanceof Error) console.log(err.message);
}
// created /tmp/job
// working in /tmp/job
// removed /tmp/job
// disk full
```

`await using` waits for `[Symbol.asyncDispose]()`, and `DisposableStack` collects one-off cleanups, run in reverse order:

```typescript
async function connect(name: string): Promise<AsyncDisposable & { query(sql: string): string }> {
  console.log(`connect ${name}`);
  return {
    query: (sql) => `${name}: ${sql}`,
    async [Symbol.asyncDispose]() {
      console.log(`disconnect ${name}`);
    },
  };
}

{
  await using db = await connect("orders");
  using stack = new DisposableStack();
  stack.defer(() => console.log("cleanup 1"));
  stack.defer(() => console.log("cleanup 2"));
  console.log(db.query("SELECT 1"));
}
// connect orders
// orders: SELECT 1
// cleanup 2
// cleanup 1
// disconnect orders
```

| Call | Does |
| --- | --- |
| `Error.isError(x)` | `x is Error`, true for real errors from any realm, false for look-alikes |
| `new Error(message, { cause })` | wraps another error, read back as `err.cause`, which is `unknown` |
| `new AggregateError(errors, message)` | several errors in one, as `err.errors` (`any[]`) |
| `err.stack` | the stack trace, `string \| undefined` |
| `using x = value` | calls `x[Symbol.dispose]()` at the end of the block (`Disposable`) |
| `await using x = value` | awaits `x[Symbol.asyncDispose]()` at the end of the block (`AsyncDisposable`) |
| `stack.defer(fn)`, `stack.use(x)`, `stack.move()` | `DisposableStack`: collect cleanups, or hand them on |

### Gotchas

- `catch (err: Error)` is a type error (TS1196). Leave the variable unannotated (it is `unknown`) and narrow it.
- The callback of a promise's `.catch` gets `any`, not `unknown`. Write `.catch((err: unknown) => ...)` to keep the check.
- A function's type never says what it throws. When callers must handle a failure, return a `Result` instead.
- Node can't run parameter properties like `constructor(readonly code: string)` (TS1294 under `erasableSyntaxOnly`), so declare fields and assign them.
