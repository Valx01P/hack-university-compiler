# More OOP

A class inherits with `extends`, and `super` reaches the parent's constructor and methods. There are no interfaces or `abstract` keyword: any object with the right method works (duck typing), and you enforce "must override" by throwing.

### Inherit and override

```javascript
class Shape {
  constructor(name) {
    if (new.target === Shape) throw new TypeError("Shape is abstract");
    this.name = name;
  }

  area() {   // "abstract": subclasses must override
    throw new Error(`${this.constructor.name} must implement area()`);
  }

  describe() {
    return `${this.name} with area ${this.area().toFixed(2)}`;
  }
}

class Rect extends Shape {
  constructor(w, h) {
    super("rect");      // call the parent constructor before using this
    this.w = w;
    this.h = h;
  }

  area() {
    return this.w * this.h;
  }

  describe() {          // override, and still use the parent's version
    return super.describe() + ` (${this.w}x${this.h})`;
  }
}

class Circle extends Shape {
  constructor(r) {
    super("circle");
    this.r = r;
  }

  area() {
    return Math.PI * this.r ** 2;
  }
}

class Square extends Rect {
  constructor(side) {
    super(side, side);
    this.name = "square";
  }
}
```

### Polymorphism in a loop

```javascript harness
class Shape {
  constructor(name) {
    if (new.target === Shape) throw new TypeError("Shape is abstract");
    this.name = name;
  }
  describe() { return `${this.name} with area ${this.area().toFixed(2)}`; }
}
class Rect extends Shape {
  constructor(w, h) { super("rect"); this.w = w; this.h = h; }
  area() { return this.w * this.h; }
  describe() { return super.describe() + ` (${this.w}x${this.h})`; }
}
class Circle extends Shape {
  constructor(r) { super("circle"); this.r = r; }
  area() { return Math.PI * this.r ** 2; }
}
class Square extends Rect {
  constructor(side) { super(side, side); this.name = "square"; }
}

{{code}}
console.log(`total: ${total.toFixed(2)}`);
console.log(`circles: ${circles.length}`);
```

```javascript
const shapes = [new Circle(1), new Rect(2, 3), new Square(2)];
for (const s of shapes) {
  console.log(s.describe());
}
// circle with area 3.14
// rect with area 6.00 (2x3)
// square with area 4.00 (2x2)

const total = shapes.reduce((t, s) => t + s.area(), 0);   // 13.14...
const circles = shapes.filter((s) => s instanceof Circle);
```

### Check types

```javascript harness
class Shape {
  constructor(name) {
    if (new.target === Shape) throw new TypeError("Shape is abstract");
    this.name = name;
  }
  describe() { return `${this.name} with area ${this.area().toFixed(2)}`; }
}
class Rect extends Shape {
  constructor(w, h) { super("rect"); this.w = w; this.h = h; }
  area() { return this.w * this.h; }
  describe() { return super.describe() + ` (${this.w}x${this.h})`; }
}
class Circle extends Shape {
  constructor(r) { super("circle"); this.r = r; }
  area() { return Math.PI * this.r ** 2; }
}
class Square extends Rect {
  constructor(side) { super(side, side); this.name = "square"; }
}

{{code}}
```

```javascript error
const sq = new Square(2);
sq instanceof Square;     // true
sq instanceof Rect;       // true, a subclass counts
sq instanceof Circle;     // false
sq.constructor.name;      // 'Square'
new Shape("x");           // TypeError: Shape is abstract
```

### Duck typing and composition

```javascript harness
class Shape {
  constructor(name) {
    if (new.target === Shape) throw new TypeError("Shape is abstract");
    this.name = name;
  }
  describe() { return `${this.name} with area ${this.area().toFixed(2)}`; }
}
class Circle extends Shape {
  constructor(r) { super("circle"); this.r = r; }
  area() { return Math.PI * this.r ** 2; }
}

{{code}}
console.log(new Car().start());
```

```javascript
// anything with area() can be used where a Shape is expected
const things = [new Circle(2), { area: () => 7 }];
for (const t of things) {
  console.log(t.area().toFixed(1));   // 12.6, then 7.0
}

// has-a instead of is-a
class Engine {
  start() { return "vroom"; }
}
class Car {
  constructor() {
    this.engine = new Engine();
  }
  start() {
    return `car: ${this.engine.start()}`;
  }
}
new Car().start();   // 'car: vroom'
```

### Compare and sort objects

```javascript
class Version {
  constructor(major, minor) {
    this.major = major;
    this.minor = minor;
  }
  equals(o) {
    return this.major === o.major && this.minor === o.minor;
  }
  static compare(a, b) {   // negative, zero, or positive, like a comparator
    return a.major - b.major || a.minor - b.minor;
  }
  toString() {
    return `${this.major}.${this.minor}`;
  }
}

const vs = [new Version(2, 0), new Version(1, 5), new Version(1, 10)];
vs.sort(Version.compare);
vs.join(", ");      // '1.5, 1.10, 2.0' (join calls toString)
```

### Make a class iterable

```javascript
class Range {
  constructor(start, end) {
    this.start = start;
    this.end = end;
  }

  *[Symbol.iterator]() {   // a generator method
    for (let i = this.start; i < this.end; i++) yield i;
  }
}

for (const n of new Range(1, 4)) console.log(n);   // 1, 2, 3
[...new Range(1, 4)];                              // [ 1, 2, 3 ]
```

| Syntax | Does |
| --- | --- |
| `class B extends A` | `B` inherits fields and methods from `A` |
| `super(args)` | run the parent constructor (required first in a subclass constructor) |
| `super.method()` | call the parent's version of an overridden method |
| `new.target` | the class `new` was called on, for abstract checks |
| `static method()` | inherited too: `B.method()` works |
| `*[Symbol.iterator]()` | makes `for...of` and `...` work on instances |
| `toString()` | used by template strings, `join`, and `+ ""` |

### Gotchas

- Touching `this` before `super()` in a subclass constructor throws a ReferenceError ("Must call super constructor...").
- If a subclass has no constructor, it gets one that passes all arguments to `super`. Write one only when you add fields.
- Subclass field initializers run right after `super()` returns, so `name = "default"` declared in the subclass overwrites the `name` the parent constructor just set.
- There is no method overloading: a second `area()` replaces the first. Branch on arguments instead.
