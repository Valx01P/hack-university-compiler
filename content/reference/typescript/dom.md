# DOM and Browser Types

With `"DOM"` in `lib`, TypeScript knows every browser API, and most lookups return a type you must narrow before you use it: `Element | null`, `EventTarget | null`, `string | null`.

### Find elements

```typescript dom
document.body.innerHTML = `
  <form id="add-book">
    <input name="title" value="Dune">
    <button>Add</button>
  </form>`;

const form = document.querySelector("form");
//    ^? const form: HTMLFormElement | null
const byId = document.querySelector("#add-book");
//    ^? const byId: Element | null
const title = document.querySelector<HTMLInputElement>("input[name=title]");
//    ^? const title: HTMLInputElement | null
const buttons = document.querySelectorAll("button");
//    ^? const buttons: NodeListOf<HTMLButtonElement>
console.log(form?.id, byId?.tagName, title?.value, buttons.length); // add-book FORM Dune 1
```

A tag name gives the exact element type. A CSS selector gives `Element`, and `querySelector<HTMLInputElement>` only claims a type, like `as`. `instanceof` checks it:

```typescript dom
document.body.innerHTML = `<input id="title" value="Dune">`;

function $<T extends Element>(selector: string, type: new () => T): T {
  const el = document.querySelector(selector);
  if (el === null) throw new Error(`Missing element: ${selector}`);
  if (!(el instanceof type)) throw new Error(`${selector} is not a ${type.name}`);
  return el;
}

const title = $("#title", HTMLInputElement);
//    ^? const title: HTMLInputElement
console.log(title.value); // Dune
try {
  $("#title", HTMLSelectElement);
} catch (err) {
  if (err instanceof Error) console.log(err.message); // #title is not a HTMLSelectElement
}
```

### Events

```typescript dom
const input = document.createElement("input");
const button = document.createElement("button");
document.body.append(input, button);

button.addEventListener("click", (event) => {
  console.log(`click at ${event.clientX},${event.clientY}`);
});
input.addEventListener("input", (event) => {
  const target = event.target;
  //    ^? const target: EventTarget | null
  if (target instanceof HTMLInputElement) console.log(`typed ${target.value}`);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") console.log("closed");
});

button.click(); // click at 0,0
input.value = "Du";
input.dispatchEvent(new InputEvent("input")); // typed Du
document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); // closed
```

| Event name | Listener gets |
| --- | --- |
| `"click"`, `"dblclick"`, `"mousedown"` | `MouseEvent` |
| `"keydown"`, `"keyup"` | `KeyboardEvent` |
| `"submit"` | `SubmitEvent` |
| `"input"` | `InputEvent` |
| `"change"` | `Event` |
| `"focus"`, `"blur"` | `FocusEvent` |
| a name it doesn't know, like `"book:saved"` | `Event` |

One listener for many buttons, with `closest` and `dataset`:

```typescript dom
document.body.innerHTML = `<ul id="books"><li>Dune <button data-action="finish" data-id="b1">Finish</button></li></ul>`;

document.querySelector("#books")?.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest("button[data-action]");
  if (!(button instanceof HTMLButtonElement)) return;
  const action = button.dataset.action;
  //    ^? const action: string | undefined
  console.log(action, button.dataset.id); // finish b1
});

document.querySelector("button")?.click();
```

### Forms and FormData

```typescript dom
document.body.innerHTML = `
  <form>
    <input name="title" value=" Dune ">
    <select name="status"><option>want</option><option selected>done</option></select>
  </form>`;

const form = document.querySelector("form");
if (form) {
  form.addEventListener("submit", (event) => {
    event.preventDefault(); // stay on the page
    const data = new FormData(form);
    const title = data.get("title");
    //    ^? const title: FormDataEntryValue | null
    if (typeof title === "string") console.log(title.trim()); // Dune
    console.log(JSON.stringify(Object.fromEntries(data))); // {"title":" Dune ","status":"done"}
  });
  form.requestSubmit();
}
```

`FormDataEntryValue` is `string | File`, so check for a string before you trim, then validate the whole form with a schema.

### localStorage

```typescript dom
type Theme = "light" | "dark";
const isTheme = (value: unknown): value is Theme => value === "light" || value === "dark";

localStorage.setItem("theme", "dark");
const saved = localStorage.getItem("theme");
//    ^? const saved: string | null
const theme: Theme = isTheme(saved) ? saved : "light";
console.log(theme); // dark

localStorage.setItem("books", JSON.stringify([{ title: "Dune" }]));
const books: unknown = JSON.parse(localStorage.getItem("books") ?? "[]");
console.log(Array.isArray(books) ? books.length : 0); // 1
localStorage.removeItem("books");
```

### Cookies

```typescript dom
document.cookie = "theme=dark; Max-Age=31536000; Path=/; SameSite=Lax";

function readCookie(name: string): string | undefined {
  for (const pair of document.cookie.split("; ")) {
    const [key, ...value] = pair.split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return undefined;
}

console.log(readCookie("theme")); // dark
console.log(readCookie("lang")); // undefined
```

`document.cookie` is one `string` of `name=value` pairs: writing it adds or replaces one cookie, and reading gives them all. Cookies go to the server with every request, and `localStorage` stays in the browser. Neither is a place for secrets.

### tsconfig for the browser

A Vite project (`npm create vite@latest`, template `vanilla-ts`) type-checks in bundler mode:

```text
{
  "compilerOptions": {
    "target": "es2023",
    "module": "esnext",
    "lib": ["ES2023", "DOM"],
    "types": ["vite/client"],
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "erasableSyntaxOnly": true
  },
  "include": ["src"]
}
```

| Option | Why |
| --- | --- |
| `"lib": ["ES2023", "DOM"]` | the browser's APIs, and no `process` or `node:` modules |
| `"moduleResolution": "bundler"` | Vite resolves imports, so `./counter` may leave out the extension |
| `"types": ["vite/client"]` | types `import.meta.env` and imports of `.css`, `.svg`, and `.png` files |
| `"noEmit": true` | `tsc` only checks: Vite strips the types and bundles |

### Gotchas

- `querySelector<HTMLInputElement>(...)` and `!` are claims nothing checks: a renamed `id` turns them into a crash. Narrow with `instanceof`, or throw a clear error.
- `event.target` is the innermost element clicked, maybe a `<span>` inside your button. Narrow it, then use `closest()`.
- `localStorage` holds strings that any old version of your app may have written. Parse them as `unknown` and validate, with a fallback.
- Never put user text in `innerHTML`. Build elements and set `textContent`.
