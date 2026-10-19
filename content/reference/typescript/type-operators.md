# Mapped, Conditional, Template Types

These operators compute a new type from another one, and the built-in utility types are written with them. A mapped type loops over keys, a conditional type picks a branch by testing assignability, and a template literal type builds string types from parts.

### Mapped types

`{ [K in keyof T]: X }` has the same keys as `T`, each with the type `X`. Inside, `T[K]` is the type of the current property.

```typescript types
type Features = { darkMode: string; search: string };
type Flags<T> = { [K in keyof T]: boolean };
type FeatureFlags = Flags<Features>;
//   ^? type FeatureFlags = { darkMode: boolean; search: boolean; }
```

```typescript
type SignupForm = { email: string; age: number };
type Validators<T> = { [K in keyof T]: (value: T[K]) => string | null };

const validators: Validators<SignupForm> = {
  email: (value) => (value.includes("@") ? null : "needs an @"),
  age: (value) => (value >= 13 ? null : "too young"),
};
console.log(validators.email("ada")); // needs an @
console.log(validators.age(30));      // null
```

### Adding and removing modifiers

`readonly` and `?` in a mapped type add those modifiers (`+readonly` and `+?` mean the same). `-readonly` and `-?` remove them.

```typescript types
type Article = { readonly id: string; title: string; body?: string };

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type Concrete<T> = { [K in keyof T]-?: T[K] };
type Draft<T> = { -readonly [K in keyof T]?: T[K] };

type M = Mutable<Article>;
//   ^? type M = { id: string; title: string; body?: string; }
type C = Concrete<Article>;
//   ^? type C = { readonly id: string; title: string; body: string; }
type D = Draft<Article>;
//   ^? type D = { id?: string; title?: string; body?: string; }
```

### Renaming keys with as

`as` after the key gives it a new name. A key renamed to `never` is dropped, which filters properties.

```typescript types
type User = { name: string; age: number };

type Getters<T> = { [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K] };
type UserGetters = Getters<User>;
//   ^? type UserGetters = { getAge: () => number; getName: () => string; }

type StringFields<T> = { [K in keyof T as T[K] extends string ? K : never]: T[K] };
type UserStrings = StringFields<User>;
//   ^? type UserStrings = { name: string; }
```

```typescript
type CartEvents = { added: { sku: string }; cleared: { at: string } };
type Handlers<E> = { [K in keyof E as `on${Capitalize<string & K>}`]: (payload: E[K]) => void };

const handlers = {
  onAdded: (payload) => console.log(`added ${payload.sku}`),
  onCleared: (payload) => console.log(`cleared at ${payload.at}`),
} satisfies Handlers<CartEvents>;

handlers.onAdded({ sku: "MUG-1" });    // added MUG-1
handlers.onCleared({ at: "09:00" });   // cleared at 09:00
```

### Conditional types

`T extends U ? X : Y` is `X` when `T` is assignable to `U`, and `Y` otherwise, like a ternary for types.

```typescript types
type TypeName<T> = T extends string ? "string" : T extends number ? "number" : "other";

type A = TypeName<"hi">;
//   ^? type A = "string"
type B = TypeName<42>;
//   ^? type B = "number"
type C = TypeName<boolean>;
//   ^? type C = "other"
```

### Distribution over unions

When the checked type is a bare type parameter and the argument is a union, the condition runs once per member and the results form a union. Wrap both sides in brackets to test the union as a whole.

```typescript types
type ToArray<T> = T extends unknown ? T[] : never;
type Split = ToArray<string | number>;
//   ^? type Split = string[] | number[]

type ToArrayOnce<T> = [T] extends [unknown] ? T[] : never;
type Joined = ToArrayOnce<string | number>;
//   ^? type Joined = (string | number)[]

type MyExclude<T, U> = T extends U ? never : T;
type Left = MyExclude<"a" | "b" | "c", "a">;
//   ^? type Left = "b" | "c"
```

### infer

Inside the `extends` clause, `infer U` names a piece of the matched type, and the true branch can use it.

```typescript types
type Unwrap<T> = T extends Promise<infer U> ? U : T;
type Inner = Unwrap<Promise<string>>;
//   ^? type Inner = string

type ElementOf<T> = T extends readonly (infer E)[] ? E : never;
type Item = ElementOf<number[]>;
//   ^? type Item = number

type FirstArg<F> = F extends (first: infer A, ...rest: never[]) => unknown ? A : never;
type Arg = FirstArg<(id: number, name: string) => void>;
//   ^? type Arg = number
```

### Template literal types

A template literal type is a string pattern. Over unions, it makes every combination.

```typescript
type Hex = `#${string}`;
type EventName = `${"order" | "user"}.${"created" | "deleted"}`;
//   ^? type EventName = "order.created" | "order.deleted" | "user.created" | "user.deleted"

function setColor(color: Hex): string {
  return `color: ${color}`;
}
console.log(setColor("#336699")); // color: #336699
```

```typescript harness
type Hex = `#${string}`;

function setColor(color: Hex): string {
  return `color: ${color}`;
}

{{code}}
```

```typescript error
setColor("blue");
// TS2345: Argument of type '"blue"' is not assignable to parameter of type '`#${string}`'.
```

### Recursive types

A type can refer to itself. That describes nested data like JSON, and with `infer` it can walk a string one piece at a time, as typed routers do.

```typescript
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

const settings: Json = { name: "app", ports: [8080, 8081], debug: false };
console.log(JSON.stringify(settings)); // {"name":"app","ports":[8080,8081],"debug":false}

type ExtractParams<P extends string> =
  P extends `${string}:${infer Param}/${infer Rest}`
    ? Param | ExtractParams<`/${Rest}`>
    : P extends `${string}:${infer Param}`
      ? Param
      : never;
type Params = ExtractParams<"/orders/:orderId/items/:itemId">;
//   ^? type Params = "itemId" | "orderId"
```

| Syntax | Means |
| --- | --- |
| `{ [K in keyof T]: X }` | a property `X` for each key of `T` |
| `{ readonly [K in keyof T]?: T[K] }` | add `readonly` and `?` |
| `{ -readonly [K in keyof T]-?: T[K] }` | remove them |
| `{ [K in keyof T as N]: T[K] }` | rename each key to `N`, and drop it when `N` is `never` |
| `T extends U ? X : Y` | `X` when `T` is assignable to `U`, else `Y` |
| `[T] extends [U] ? X : Y` | the same test without distributing over a union |
| `T extends Promise<infer U> ? U : T` | `infer` captures a part of the matched type |
| `Uppercase<S>`, `Capitalize<S>` | change the case of a string literal type |

### Gotchas

- A conditional type distributes when its checked type is a bare type parameter: `ToArray<string | number>` is `string[] | number[]`. Wrap both sides in brackets to get `(string | number)[]`.
- `never` is an empty union, so a distributive conditional type turns it into `never`: with `type IsString<T> = T extends string ? true : false`, `IsString<never>` is `never`, not `false`.
- `keyof T` can include `number` and `symbol` keys, so `Capitalize<K>` on a key is TS2344. Write `Capitalize<string & K>`.
