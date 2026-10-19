# Literal Types

A literal type is one exact value, like `"north"`, `404`, or `true`, and a union of them is the everyday way to say "one of these values". `as const` keeps the literals in your data, so the union can come from the data.

### String and number literal unions

```typescript
type Direction = "north" | "south" | "east" | "west";
type Dice = 1 | 2 | 3 | 4 | 5 | 6;

function move(d: Direction, steps: Dice): string {
  return `${steps} steps ${d}`;
}
console.log(move("north", 3)); // 3 steps north
```

```typescript error
type Direction = "north" | "south" | "east" | "west";
function move(d: Direction): string {
  return d;
}
move("up"); // TS2345: Argument of type '"up"' is not assignable to parameter of type 'Direction'.
```

### Widening

`const` keeps the literal. `let` and object properties widen to `string`, `number`, or `boolean`, because they can change.

```typescript
const a = "north";
//    ^? const a: "north"
let b = "north";
//  ^? let b: string
const plan = { dir: "north", steps: 2 };
//    ^? const plan: { dir: string; steps: number; }
const fixed = { dir: "north", steps: 2 } as const;
//    ^? const fixed: { readonly dir: "north"; readonly steps: 2; }
console.log(a, b, plan.dir, fixed.dir); // north north north north
```

So a widened value no longer fits the union. Annotate it (`const plan: { dir: Direction } = ...`) or add `as const`.

```typescript error
type Direction = "north" | "south" | "east" | "west";
function move(d: Direction): string {
  return d;
}
const plan = { dir: "north" };
move(plan.dir); // TS2345: Argument of type 'string' is not assignable to parameter of type 'Direction'.
```

### as const

`as const` makes an array a `readonly` tuple of literals, and an object's properties `readonly` literals, all the way down.

```typescript
const ROLES = ["admin", "editor", "viewer"] as const;
//    ^? const ROLES: readonly ["admin", "editor", "viewer"]
const HTTP = { ok: 200, notFound: 404 } as const;
//    ^? const HTTP: { readonly ok: 200; readonly notFound: 404; }
for (const role of ROLES) {
  console.log(role); // admin, then editor, then viewer
}
console.log(HTTP.notFound); // 404
```

```typescript error
const ROLES = ["admin", "editor", "viewer"] as const;
ROLES.push("owner"); // TS2339: Property 'push' does not exist on type 'readonly ["admin", "editor", "viewer"]'.
```

### Derive a union from an array or object

In a type, `typeof X` is the type of the value `X`. Index it with `[number]` for an array's elements, and use `keyof` for an object's keys.

```typescript
const ROLES = ["admin", "editor", "viewer"] as const;
type Role = (typeof ROLES)[number];
//   ^? type Role = "admin" | "editor" | "viewer"

const HTTP = { ok: 200, notFound: 404 } as const;
type HttpName = keyof typeof HTTP;
//   ^? type HttpName = "notFound" | "ok"
type HttpCode = (typeof HTTP)[HttpName];
//   ^? type HttpCode = 200 | 404

const role: Role = "editor";
const code: HttpCode = HTTP.notFound;
console.log(role, code); // editor 404
```

| Write | Gives |
| --- | --- |
| `typeof X` (in a type) | the type of the value `X` |
| `(typeof ROLES)[number]` | a union of an `as const` array's elements |
| `keyof typeof HTTP` | a union of an object's keys |
| `(typeof HTTP)[keyof typeof HTTP]` | a union of an object's values |

### Check a string from outside

A plain `string` (input, JSON) has to be checked before it counts as a `Role`. A type predicate (`x is Role`, see Unions and Narrowing) does the check once.

```typescript
const ROLES = ["admin", "editor", "viewer"] as const;
type Role = (typeof ROLES)[number];

function isRole(x: string): x is Role {
  return ROLES.some((r) => r === x);
}
for (const input of ["editor", "owner"]) {
  console.log(input, isRole(input) ? "is a role" : "is not a role"); // editor is a role, then owner is not a role
}
```

```typescript error
const ROLES = ["admin", "editor", "viewer"] as const;
const input: string = "owner";
ROLES.includes(input); // TS2345: Argument of type 'string' is not assignable to parameter of type '"admin" | "editor" | "viewer"'.
```

### satisfies versus an annotation

An annotation makes the variable exactly that type and forgets the rest. `satisfies` checks the value against the type and keeps the value's own, more precise type.

```typescript
const annotated: Record<string, string> = { home: "/", about: "/about" };
const blog = annotated["blog"];
//    ^? const blog: string | undefined

const routes = { home: "/", about: "/about" } satisfies Record<string, string>;
//    ^? const routes: { home: string; about: string; }
console.log(blog, routes.home); // undefined /

const PRICES = { free: 0, pro: 12, team: 30 } as const satisfies Record<string, number>;
type Plan = keyof typeof PRICES;
//   ^? type Plan = "free" | "pro" | "team"
console.log(PRICES.pro); // 12
```

```typescript error
const routes = { home: "/", about: "/about" } satisfies Record<string, string>;
console.log(routes.blog); // TS2339: Property 'blog' does not exist on type '{ home: string; about: string; }'.
```

`satisfies` also catches a misspelled key. TS2561 ends with `Did you mean to write 'secondary'?`

```typescript error
const colors = { primary: "#336", secondry: "#999" } satisfies { primary: string; secondary: string }; // TS2561
```

| | `const x: T = value` | `const x = value satisfies T` |
| --- | --- | --- |
| Checks the value against `T` | yes | yes |
| Type of `x` | `T` | the value's own type |
| An unknown key, like `x.blog` | allowed when `T` is `Record<string, ...>` | TS2339 |
| Good for | variables you change later | config objects and lookup tables |

### Gotchas

- `as const` is deep: every property and element becomes `readonly`, so you can't change anything in it.
- `ROLES.includes(input)` on an `as const` array rejects a plain `string`. Use a guard with `some`, as above.
- An annotation hides the literal: `const mode: string = "dark"` is just a `string`. Use `satisfies` to check without widening.
- Rules that ban `as` casts still allow `as const`, which only keeps literals and never claims a type.
