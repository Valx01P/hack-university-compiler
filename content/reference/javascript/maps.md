# Maps

JavaScript has two dictionaries: `Map` (any key type, keeps insertion order, has `.size`) and the plain object `{}` (string keys, best for fixed records and JSON). Reach for `Map` when the keys come from data, like counting words.

### Create

```javascript
const empty = new Map();
const m = new Map([["ann", 31], ["bob", 25]]);  // from [key, value] pairs
const obj = { ann: 31, bob: 25 };               // plain object
const fromObj = new Map(Object.entries(obj));   // object to Map
console.log(fromObj); // Map(2) { 'ann' => 31, 'bob' => 25 }
```

### Add, update, remove

```javascript harness
const m = new Map([["ann", 31], ["bob", 25]]);
const obj = { ann: 31, bob: 25 };
{{code}}
console.log(m);
console.log(obj);
```

```javascript
m.set("cy", 40);                  // add or overwrite
m.set("ann", m.get("ann") + 1);   // update
console.log(m.delete("bob"));     // true (false if it was missing)
console.log(m.size);              // 2 (a property, not a method)

obj.cy = 40;                      // objects: just assign
obj["dee"] = 22;
delete obj.bob;
```

### Look up

```javascript harness
const m = new Map([["ann", 32], ["cy", 40]]);
const obj = { ann: 31, cy: 40, dee: 22 };
{{code}}
```

```javascript
console.log(m.get("ann"));               // 32
console.log(m.get("zed"));               // undefined
console.log(m.has("zed"));               // false
console.log(m.get("zed") ?? 0);          // 0, a default for missing keys

console.log(obj.ann);                    // 31
const key = "cy";
console.log(obj[key]);                   // 40 (brackets when the key is in a variable)
console.log("ann" in obj);               // true
console.log(Object.hasOwn(obj, "ann"));  // true
```

### Loop

```javascript harness
const m = new Map([["ann", 32], ["cy", 40]]);
const obj = { ann: 31, cy: 40, dee: 22 };
{{code}}
```

```javascript
for (const [name, age] of m) {
  console.log(`${name} is ${age}`);  // ann is 32, then cy is 40
}
m.forEach((age, name) => console.log(name, age));  // value comes first

for (const [k, v] of Object.entries(obj)) {
  console.log(k, v);
}
```

### Count

```javascript
const words = "the cat and the hat".split(" ");
const counts = new Map();
for (const w of words) {
  counts.set(w, (counts.get(w) ?? 0) + 1);
}
console.log(counts.get("the"));  // 2
```

### Group

`Object.groupBy` and `Map.groupBy` are not available here, so build the lists yourself.

```javascript
const groups = new Map();
for (const w of ["apple", "avocado", "banana"]) {
  const first = w[0];
  if (!groups.has(first)) groups.set(first, []);
  groups.get(first).push(w);
}
console.log(groups); // Map(2) { 'a' => [ 'apple', 'avocado' ], 'b' => [ 'banana' ] }
```

### Sort and convert

```javascript harness
const m = new Map([["ann", 32], ["cy", 40]]);
const counts = new Map();
for (const w of "the cat and the hat".split(" ")) {
  counts.set(w, (counts.get(w) ?? 0) + 1);
}
{{code}}
console.log(byKey);
```

```javascript
console.log([...m.keys()]);    // [ 'ann', 'cy' ]
console.log([...m.values()]);  // [ 32, 40 ]
console.log([...m]);           // [ [ 'ann', 32 ], [ 'cy', 40 ] ]

const top = [...counts].sort((a, b) => b[1] - a[1]);  // by count, highest first
console.log(top[0]);           // [ 'the', 2 ]
const byKey = new Map([...m].sort((a, b) => a[0].localeCompare(b[0])));

console.log(Object.fromEntries(m));                  // { ann: 32, cy: 40 }
console.log(JSON.stringify(Object.fromEntries(m)));  // {"ann":32,"cy":40}
```

| Call | Does |
| --- | --- |
| `new Map(pairs)` | build from an array of `[key, value]` pairs |
| `m.set(k, v)` | add or overwrite, returns `m` so calls chain |
| `m.get(k)` | the value, or `undefined` |
| `m.has(k)` | `true` if the key exists |
| `m.delete(k)` | remove, returns whether it was there |
| `m.size` | number of entries |
| `m.clear()` | remove every entry |
| `m.keys()`, `m.values()`, `m.entries()` | iterators, spread into `[...]` for an array |
| `Object.keys(o)`, `Object.values(o)`, `Object.entries(o)` | arrays from a plain object |
| `Object.fromEntries(pairs)` | pairs or a Map to a plain object |

### Gotchas

- `m["x"] = 1` on a Map sets a plain property, not an entry: `m.get("x")` is `undefined`. Always use `set` and `get`.
- Object keys are always strings: `obj[1]` and `obj["1"]` are the same key, and `Object.keys` returns strings. A Map keeps `1` and `"1"` apart.
- Array keys compare by reference, so `m.get([1, 2])` never finds a key set as another `[1, 2]`. Use a string key such as `"1,2"`, built with a template string.
- `JSON.stringify(m)` gives `"{}"`. Convert with `Object.fromEntries(m)` first.
