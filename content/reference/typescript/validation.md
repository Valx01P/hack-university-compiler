# JSON and zod

`JSON.parse` returns `any`, so store what it gives you as `unknown` and check it before you use it. zod checks data at runtime and derives the TypeScript type from the same schema, so the check and the type can't disagree.

### JSON.parse is any

```typescript
const loose = JSON.parse('{"retries": 3}');
//    ^? const loose: any
const data: unknown = JSON.parse('{"retries": 3}');
if (typeof data === "object" && data !== null && "retries" in data && typeof data.retries === "number") {
  console.log(data.retries + 1); // 4
}
```

### A JsonValue type

```typescript
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const settings: JsonValue = { theme: "dark", sizes: [12, 14], beta: null };
console.log(JSON.stringify(settings)); // {"theme":"dark","sizes":[12,14],"beta":null}
```

```typescript error
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const saved: JsonValue = { savedAt: new Date(0) }; // TS2322: Type '{ savedAt: Date; }' is not assignable to type 'JsonValue'.
```

What `JSON.stringify` does to values that aren't JSON:

```typescript
const odd = { gone: undefined, fn: () => 1, at: new Date(0), map: new Map([["a", 1]]), nan: NaN };
console.log(JSON.stringify(odd)); // {"at":"1970-01-01T00:00:00.000Z","map":{},"nan":null}
```

### Schemas and z.infer

```typescript
import * as z from "zod";

const User = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  email: z.email(),
  role: z.enum(["admin", "member"]).default("member"),
  tags: z.array(z.string()).optional(),
});
type User = z.infer<typeof User>;
//   ^? type User = { id: number; name: string; email: string; role: "admin" | "member"; tags?: string[] | undefined; }

const user = User.parse({ id: 1, name: "Ada", email: "ada@example.com" });
console.log(JSON.stringify(user)); // {"id":1,"name":"Ada","email":"ada@example.com","role":"member"}
```

| Schema | Gives |
| --- | --- |
| `z.string()`, `z.number()`, `z.boolean()`, `z.bigint()`, `z.date()` | the primitive |
| `z.literal("on")`, `z.enum(["a", "b"])` | `"on"`, `"a" \| "b"` |
| `z.email()`, `z.url()`, `z.uuid()`, `z.iso.datetime()` | `string`, in that format |
| `z.array(S)`, `z.tuple([A, B])`, `z.record(z.string(), S)` | `S[]`, `[A, B]`, `Record<string, S>` |
| `z.object({...})`, `z.strictObject({...})`, `z.looseObject({...})` | an object: extra keys dropped, rejected, or kept |
| `z.union([A, B])`, `z.discriminatedUnion("kind", [A, B])` | `A \| B` |
| `.optional()`, `.nullable()`, `.nullish()` | adds `undefined`, `null`, or both |
| `.default(v)` | `v` when the input is `undefined` |
| `.min(n)`, `.max(n)`, `.int()`, `.positive()`, `.regex(re)` | a check, same type |
| `.pick({ id: true })`, `.omit({...})`, `.extend({...})`, `.partial()` | a new object schema, like the utility types |

### parse, safeParse, and error messages

```typescript harness
import * as z from "zod";

const User = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  email: z.email(),
  role: z.enum(["admin", "member"]).default("member"),
  tags: z.array(z.string()).optional(),
});
{{code}}
```

```typescript
const result = User.safeParse({ id: 0, name: "Ada", email: "nope" });
if (!result.success) {
  console.log(z.prettifyError(result.error));
  // ✖ Too small: expected number to be >0
  //   → at id
  // ✖ Invalid email address
  //   → at email
  console.log(z.flattenError(result.error).fieldErrors.email); // [ 'Invalid email address' ]
  for (const issue of result.error.issues) console.log(issue.path.join("."), issue.code);
  // id too_small
  // email invalid_format
}

try {
  User.parse({ name: "Ada" });
} catch (err) {
  if (err instanceof z.ZodError) console.log(err.issues.length); // 2
}
```

### refine and transform

```typescript
import * as z from "zod";

const Range = z
  .object({ min: z.number(), max: z.number() })
  .refine((r) => r.min <= r.max, { message: "max must be at least min", path: ["max"] });
const bad = Range.safeParse({ min: 5, max: 1 });
if (!bad.success) console.log(z.prettifyError(bad.error));
// ✖ max must be at least min
//   → at max

const Price = z
  .string()
  .regex(/^\d+\.\d{2}$/)
  .transform((text) => Math.round(Number(text) * 100));
type PriceIn = z.input<typeof Price>;
//   ^? type PriceIn = string
type PriceOut = z.output<typeof Price>;
//   ^? type PriceOut = number
console.log(Price.parse("12.50")); // 1250
```

### Strings in, typed values out: coerce and stringbool

```typescript
import * as z from "zod";

const Env = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  LOG_LEVEL: z.enum(["debug", "info", "warn"]).default("info"),
  DEBUG: z.stringbool().default(false),
});

const env = Env.parse({ PORT: "3000", DEBUG: "yes" }); // Env.parse(process.env) in an app
console.log(env.PORT + 1, env.LOG_LEVEL, env.DEBUG); // 3001 info true
console.log(z.stringbool().safeParse("maybe").success); // false
console.log(z.coerce.boolean().parse("false")); // true
```

### Codecs: decode and encode

```typescript
import * as z from "zod";

const IsoDate = z.codec(z.iso.datetime(), z.date(), {
  decode: (text) => new Date(text),
  encode: (date) => date.toISOString(),
});

const when = IsoDate.decode("2026-10-01T09:00:00Z");
//    ^? const when: Date
console.log(when.getUTCHours()); // 9
console.log(IsoDate.encode(new Date(Date.UTC(2026, 9, 1)))); // 2026-10-01T00:00:00.000Z
```

### z.infer, z.input, and z.output

```typescript
import * as z from "zod";

const Item = z.object({ sku: z.string(), tags: z.array(z.string()).default([]) });

type ItemIn = z.input<typeof Item>;
//   ^? type ItemIn = { sku: string; tags?: string[] | undefined; }
type ItemOut = z.output<typeof Item>;
//   ^? type ItemOut = { sku: string; tags: string[]; }
type Same = z.infer<typeof Item>;
//   ^? type Same = { sku: string; tags: string[]; }

console.log(JSON.stringify(Item.parse({ sku: "MUG" }))); // {"sku":"MUG","tags":[]}
```

### Gotchas

- `z.infer` is the output type. With `.default`, `.transform`, or `z.coerce`, what you accept differs, so type raw input with `z.input`.
- `z.object` drops keys it doesn't know without a word. Use `z.strictObject` to reject them, or `z.looseObject` to keep them.
- `z.coerce.boolean()` turns every non-empty string into `true`, `"false"` included. Use `z.stringbool()` for flags.
- `parse` throws a `ZodError`. Where bad input is normal (requests, files, forms), use `safeParse` and handle `success: false`.
