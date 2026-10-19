# Object Types

An object type lists the properties a value must have, written inline or named with `type`. TypeScript compares shapes, not names, so any object with the right properties fits.

### Describe a shape

```typescript
type User = { id: number; name: string };
type Address = { street: string; city: string };
type Customer = { name: string; address: Address; tags: string[] };

function describe(u: User): string {
  return `#${u.id} ${u.name}`;
}
function area(box: { width: number; height: number }): number {
  return box.width * box.height;
}

const ada: Customer = { name: "Ada", address: { street: "12 Byron St", city: "London" }, tags: ["vip"] };
console.log(describe({ id: 1, name: "Ada" }));          // #1 Ada
console.log(`${ada.name}, ${ada.address.city}`);        // Ada, London
console.log(area({ width: 3, height: 4 }));             // 12
```

Every property is required unless it is marked optional.

```typescript error
type User = { id: number; name: string };
const u: User = { id: 1 }; // TS2741: Property 'name' is missing in type '{ id: number; }' but required in type 'User'.
```

### Optional and readonly properties

```typescript
type Profile = { readonly id: number; name: string; bio?: string };
const ada: Profile = { id: 1, name: "Ada" };
const bio = ada.bio;
//    ^? const bio: string | undefined
console.log(ada.bio ?? "(no bio)"); // (no bio)
ada.bio = "Mathematician";
console.log(ada.bio);               // Mathematician
```

```typescript error
type Profile = { readonly id: number; name: string };
const ada: Profile = { id: 1, name: "Ada" };
ada.id = 2; // TS2540: Cannot assign to 'id' because it is a read-only property.
```

### Missing versus undefined

With `exactOptionalPropertyTypes` on, as here, `bio?: string` means the key may be missing, not that it may hold `undefined`.

```typescript error
type Profile = { name: string; bio?: string };
const p: Profile = { name: "Ada", bio: undefined }; // TS2375
```

Leave the key out, or say `undefined` is allowed with `bio?: string | undefined`.

```typescript
type Profile = { name: string; bio?: string };
function makeProfile(name: string, bio?: string): Profile {
  return { name, ...(bio !== undefined ? { bio } : {}) };
}
console.log(makeProfile("Ada"), makeProfile("Ben", "Hi")); // { name: 'Ada' } { name: 'Ben', bio: 'Hi' }

type Draft = { name: string; bio?: string | undefined };
const draft: Draft = { name: "Ada", bio: undefined };
console.log(Object.keys(draft)); // [ 'name', 'bio' ]
```

### Same shape, same type

A value fits a type when it has the properties the type asks for, even with more of its own.

```typescript
type Point = { x: number; y: number };
function show(p: Point): string {
  return `(${p.x}, ${p.y})`;
}
const point3d = { x: 1, y: 2, z: 3 };
console.log(show(point3d)); // (1, 2)
```

### Excess property checks

An object literal written straight into a typed spot may only have the type's properties. That is how typos in options objects get caught.

```typescript error
type Point = { x: number; y: number };
const p: Point = { x: 1, y: 2, z: 3 }; // TS2353: Object literal may only specify known properties, and 'z' does not exist in type 'Point'.
```

```typescript error
type NewUser = { name: string; email?: string };
function createUser(user: NewUser): void {}
createUser({ name: "Ada", emial: "ada@example.com" }); // TS2561
```

The TS2561 message ends with `Did you mean to write 'email'?`

### Index signatures and Record

`Record<string, number>` and `{ [key: string]: number }` are the same type: an object used as a dictionary. Reading a key gives `number | undefined` under `noUncheckedIndexedAccess`.

```typescript
const stock: Record<string, number> = { apple: 3, pear: 0 };
const apples = stock["apple"];
//    ^? const apples: number | undefined
stock["kiwi"] = 5;
console.log(apples, stock["plum"] ?? 0); // 3 0
for (const [fruit, n] of Object.entries(stock)) {
  console.log(`${fruit}: ${n}`);         // apple: 3, then pear: 0, then kiwi: 5
}

const counts: { [word: string]: number } = {};
for (const word of "the cat and the hat".split(" ")) {
  counts[word] = (counts[word] ?? 0) + 1;
}
console.log(counts); // { the: 2, cat: 1, and: 1, hat: 1 }
```

With a union of keys, `Record` requires every key, and reading one is never `undefined`.

```typescript
type Size = "s" | "m" | "l";
const price: Record<Size, number> = { s: 8, m: 10, l: 12 };
const medium = price.m;
//    ^? const medium: number
console.log(medium); // 10
```

### Record versus Map

```typescript
const counts = new Map<string, number>();
for (const word of "the cat and the hat".split(" ")) {
  counts.set(word, (counts.get(word) ?? 0) + 1);
}
const the = counts.get("the");
//    ^? const the: number | undefined
console.log(the, counts.size);   // 2 4
console.log([...counts.keys()]); // [ 'the', 'cat', 'and', 'hat' ]
```

| | `Record<string, T>` | `Map<string, T>` |
| --- | --- | --- |
| Keys | strings (numbers become strings) | any value, objects too |
| Read | `obj[key]`, a `T \| undefined` | `map.get(key)`, a `T \| undefined` |
| Size | `Object.keys(obj).length` | `map.size` |
| JSON | `JSON.stringify(obj)` works | prints `{}`: use `Object.fromEntries(map)` first |
| Best for | fixed settings, data from JSON | dictionaries you add to and delete from often |

### Gotchas

- Excess property checks only apply to a literal written in place. A variable holding the same extra properties passes.
- `Object.keys(obj)` is `string[]`, not a union of the type's keys, because an object may carry more keys than its type lists.
- `readonly` is shallow: `readonly tags: string[]` stops `tags = []` but not `tags.push("x")`. Use `readonly string[]` too.
- The type `{}` means any value except `null` and `undefined`, so `const x: {} = 5` compiles. Use `Record<string, never>` for an empty object.
