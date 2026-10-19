# Enums and Alternatives

An `enum` is one of the few TypeScript features that generates JavaScript, so Node can't strip it and the course config rejects it (TS1294). Use a literal union, or an `as const` object plus a type with the same name, which keeps `Status.Active` working.

### Why enums don't run here

```typescript error
enum Level {
  Low,
  Medium,
  High,
}
console.log(Level.High);
// TS1294: This syntax is not allowed when 'erasableSyntaxOnly' is enabled.
```

With the checker off, Node refuses the same file: `SyntaxError [ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX]: TypeScript enum is not supported in strip-only mode`.

```typescript error
// @ts-nocheck
enum Level {
  Low,
  Medium,
  High,
}
console.log(Level.High);
```

### The JavaScript an enum generates

This is what `tsc` 7.0.2 emits for the `Level` enum above and for `enum Status { Active = "active", Archived = "archived" }`. A numeric enum maps both ways, a string enum one way.

```typescript
// @ts-nocheck
var Level;
(function (Level) {
    Level[Level["Low"] = 0] = "Low";
    Level[Level["Medium"] = 1] = "Medium";
    Level[Level["High"] = 2] = "High";
})(Level || (Level = {}));
var Status;
(function (Status) {
    Status["Active"] = "active";
    Status["Archived"] = "archived";
})(Status || (Status = {}));

console.log(Level.High);            // 2
console.log(Level[2]);              // High
console.log(Object.values(Level));  // [ 'Low', 'Medium', 'High', 0, 1, 2 ]
console.log(Object.values(Status)); // [ 'active', 'archived' ]
```

### An as const object and a type of the same name

The object holds the values at runtime, and the type is the union of those values. A value and a type can share a name, so callers keep writing `Status.Active` and `status: Status`.

```typescript
const Status = {
  Active: "active",
  Archived: "archived",
} as const;
type Status = (typeof Status)[keyof typeof Status];
//   ^? type Status = "active" | "archived"

function describe(status: Status): string {
  return status === Status.Active ? "visible" : "hidden";
}

console.log(Status.Active);             // active
console.log(describe(Status.Archived)); // hidden
console.log(describe("active"));        // visible
```

A plain string like `"active"` fits the union. A string enum rejects it (TS2345 as an argument, TS2322 in an assignment), so the union leaves less to convert at the edges.

### A literal union and a list to loop over

When nothing needs names like `Level.High`, a union is enough. Keep the values in an `as const` array to loop over them and to check strings that come from outside.

```typescript
const LEVELS = ["low", "medium", "high"] as const;
type Level = (typeof LEVELS)[number];
//   ^? type Level = "high" | "low" | "medium"

function isLevel(text: string): text is Level {
  return LEVELS.some((level) => level === text);
}

console.log(LEVELS.join(" < "));                // low < medium < high
for (const input of ["high", "urgent"]) {
  console.log(isLevel(input) ? `level: ${input}` : `unknown: ${input}`);
}
// level: high
// unknown: urgent
```

### Numbers and reverse lookups

```typescript
const Level = { Low: 0, Medium: 1, High: 2 } as const;
type Level = (typeof Level)[keyof typeof Level];
//   ^? type Level = 0 | 1 | 2

function levelName(value: Level): string {
  const entry = Object.entries(Level).find(([, v]) => v === value);
  return entry ? entry[0] : "unknown";
}

console.log(levelName(Level.High));                  // High
console.log(JSON.stringify({ level: Level.Medium })); // {"level":1}
```

### Bit flags

Give each flag its own bit, combine them with `|`, and test them with `&`.

```typescript
const Permission = { Read: 1, Write: 2, Delete: 4 } as const;
type Permission = (typeof Permission)[keyof typeof Permission];

function has(granted: number, permission: Permission): boolean {
  return (granted & permission) !== 0;
}

let granted = Permission.Read | Permission.Delete;
console.log(granted);                          // 5
console.log(has(granted, Permission.Write));   // false
console.log(has(granted, Permission.Delete));  // true
granted &= ~Permission.Delete;
console.log(granted);                          // 1
```

`has(granted, 3)` is TS2345, because `3` isn't one of the flags.

### Migrating off enums

1. Replace `enum Color { Red = "red", Blue = "blue" }` with `const Color = { Red: "red", Blue: "blue" } as const`.
2. Add `type Color = (typeof Color)[keyof typeof Color]` right after it. `Color.Red` and `color: Color` keep compiling.
3. For a numeric enum, keep the same numbers, and replace each reverse lookup `Level[n]` with a search like `levelName`.
4. Rewrite a `const enum` the same way. TS1294 rejects it too.
5. Where strings come in from outside (JSON, arguments, query strings), check them with a guard like `isLevel`.
6. A codebase that can't move yet still runs with `tsx` or a `tsc` build. Angular and NestJS projects compile their code, which is where you still meet enums.

| Enum code | Erasable replacement |
| --- | --- |
| `enum Color { Red = "red" }` | `const Color = { Red: "red" } as const` |
| `color: Color` | `type Color = (typeof Color)[keyof typeof Color]` |
| `Color.Red` | unchanged |
| `Level[2]` | `Object.entries(Level).find(([, v]) => v === 2)` |
| `enum Flags { A = 1, B = 2 }` | `const Flags = { A: 1, B: 2 } as const` |
| `const enum` | the same `as const` object |

### Gotchas

- `keyof typeof Status` is the keys (`"Active" | "Archived"`), not the values. The values are `(typeof Status)[keyof typeof Status]`.
- `LEVELS.includes(input)` with a `string` input is TS2345, since the array only holds the three literals. Use `LEVELS.some((level) => level === input)` as in `isLevel`.
- Without `as const`, `{ Read: 1 }` has the type `{ Read: number }`, so the union of its values is just `number`.
- `Object.values` on a numeric enum returns the names and the numbers together, as shown above. An `as const` object returns only its values.
