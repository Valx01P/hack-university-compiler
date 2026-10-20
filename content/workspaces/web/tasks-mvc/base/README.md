# Tasks

A to-do list in plain JavaScript, with no framework, split the way larger front ends
are: a **Model** that owns the data, **Views** that draw it, and a **Controller** that
turns what you do into changes. Tasks are saved in `localStorage`, the filter lives in
the URL, and every feature has tests: Vitest for the logic, Playwright for the page.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts Vite on the workspace's port, with hot reload. Run starts this |
| `npm test` | Runs the unit tests in `tests/unit` with Vitest (well under a second) |
| `npm run test:watch` | Runs the unit tests again every time you save |
| `npm run e2e` | Runs the end-to-end tests in `tests/e2e` in headless Chromium. It uses the running dev server, or starts one |
| `npm run build` | Bundles the app into `dist/` for production |
| `npm run preview` | Serves `dist/` on the same port (stop the dev server first) |

The dev server prints the address it listens on, such as `Local: http://localhost:23017/`.
That address works in the preview, in a new tab, and in the terminal:
`curl -s localhost:$PORT | head`.

## The pattern

```text
  click, submit, keydown, popstate
                 |
                 v
     +------------------------+   store.toggle(id)    +----------------------+
     |  Controller            | --------------------> |  Model               |
     |  task-controller.js    |                       |  task-store.js       |
     +------------------------+                       +----------------------+
           |          ^                                          |
           |          |   every subscriber gets the new list     |
           |          +------------------------------------------+
           |          |                                          |
           v          | render()                                 v
     +------------------------+                       saveTasks(tasks)
     |  Views                 |                       persist.js -> localStorage
     |  task-view.js          |
     |  footer-view.js        |
     +------------------------+
```

- The **Controller** calls the **Model**. It never edits a task itself.
- The **Model** notifies its subscribers. It knows nothing about the DOM or storage.
- The **Views** render what the Model holds. They never listen for events and never
  change data.

Data moves in one direction, so when the screen shows something wrong, there are only
two places to look: the data in the store, or the view that drew it.

## How the code is laid out

```text
index.html                     the page shell: form#new-task, ul#task-list, footer#task-footer, template#task-item
src/main.js                    composition root: loads saved tasks, creates the store and the controller, reads ?filter
src/model/task-store.js        TaskStore (add, toggle, rename, remove, clearCompleted, subscribe, tasks) and the filters
src/model/persist.js           loadTasks() and saveTasks() for the "tasks:v1" key, with a shape check and safe fallbacks
src/model/seed.js              the three sample tasks a first visit shows
src/view/task-view.js          renderTasks(): rows cloned from the template, updated in place by data-id. Editing and focus
src/view/footer-view.js        renderFooter(): "1 item left" (Intl.PluralRules), aria-current on the filter, Clear completed
src/controller/task-controller.js  every event listener: the form, the list (delegated), the filter links, history
src/lib/dom.js                 qs(), qsa(), and delegate()
src/lib/ids.js                 newId(), a crypto.randomUUID()
src/styles/app.css             tokens, layout, .is-done, .is-editing, :focus-visible, reduced motion
tests/unit/                    Vitest: the store and persistence, in Node with no browser
tests/e2e/tasks.spec.js        Playwright: adding, checking off, and reloading in Chromium
```

Imports point one way: `main.js` imports everything, the controller imports the views
and the model, the views import only the model's pure helpers (`filterTasks`,
`countActive`), and the model imports only `lib/ids.js`. Anything may use `lib/`, and
nothing but `main.js` imports the controller.

## Follow one click through the layers

Checking off "Add your first task":

1. The browser fires `click` on the row's checkbox. The one listener on `#task-list`
   (`delegate()` in `lib/dom.js`) sees that the click came from an element with
   `data-action`, and calls the controller's `#onAction`.
2. The controller finds the row with `rowOf()`, reads its `data-id`, and calls
   `store.toggle("seed-2")`.
3. The store builds a new array in which that task has `done: true`, freezes it, and
   calls each subscriber with it.
4. The subscriber from `main.js` calls `saveTasks()`, which writes the list to
   `localStorage["tasks:v1"]`.
5. The subscriber from `TaskController.start()` calls `render()`. `renderTasks()` finds
   the row by its `data-id` and updates it in place, and `renderFooter()` changes
   "2 items left" to "1 item left".
6. The controller calls `focusTask()`. The checkbox still has focus, because its row was
   updated rather than rebuilt. Under the Active filter the row leaves the list, so focus
   moves to the row that took its place.

## Conventions

- **The store's list is frozen.** `store.tasks` can be read anywhere, but
  `store.tasks.push(...)` throws. Changes go through the store's methods, so subscribers
  always hear about them.
- **Methods report what happened.** `add()` returns the new task or `null`, and the other
  methods return `true` when the list changed. Nothing is saved or rendered when nothing
  changed.
- **Rows are keyed by `data-id`.** `renderTasks()` updates existing rows instead of
  rebuilding the list, so focus, an open editor, and a click in progress all survive a
  re-render. This is the same job React's `key` prop does.
- **Saved data is checked before it is trusted.** `tasks:v1` holds a JSON array of
  `{ id, title, done }`. Anything else (text that is not JSON, a missing field, a field of
  the wrong type) is ignored with a console warning, and the sample tasks load instead.
  Saving returns `false` instead of throwing when storage is full or blocked.
- **The filter lives in the URL.** The links are real links (`?filter=active`), so
  Ctrl-click opens a new tab and a shared link opens on the same filter. A normal click
  calls `history.pushState`, and `popstate` makes Back and Forward work without a reload.
- **Ids come from one place.** `TaskStore` takes a `createId` option, so tests get
  `t1`, `t2`, `t3` instead of random UUIDs.

## The page's contract

The controller, the views, and the tests find elements by these names, so keep them when
you change the markup.

| Selector | What it is |
| --- | --- |
| `#new-task`, `#new-task-title` | The form and its text field, labelled "New task" |
| `#task-list` | The list. Each row is an `li.task` with `data-id`, cloned from `#task-item` |
| `.task-toggle`, `.task-title`, `.task-title-input` | A row's checkbox (named by its title), title, and edit field |
| `[data-action="toggle"]`, `"edit"`, `"delete"` | The row controls the delegated click listener acts on |
| `.is-done`, `.is-editing` | Row states, set by `task-view.js` and styled in `app.css` |
| `#task-footer`, `.task-count` | The footer (hidden when the list is empty) and its `role="status"` count |
| `a[data-filter]` | The All, Active, and Completed links. The current one has `aria-current="page"` |
| `#clear-completed` | Shown only while some task is done |

## Keyboard and screen readers

Every action works without a mouse: Tab to a row's checkbox and press Space, or Tab to
Edit or Delete and press Enter. In the edit field, Enter saves and Escape cancels, and a
double-click on a title also starts editing. Focus always lands somewhere sensible: on
the next row after a delete, back on Edit after an edit, and on the new task field when
the list empties. Screen readers hear the title with every control ("Delete, button,
Buy milk"), and the count is a live region, so "1 item left" is announced as it changes.

## Tests

- `npm test` runs `tests/unit` in Node. The store tests use only the public methods, so
  they keep passing however the store is written inside, as long as it behaves. The
  persistence tests pass their own in-memory storage.
- `npm run e2e` runs `tests/e2e` in Chromium. Each test gets a fresh browser context, so
  `localStorage` starts empty, and any error the page throws fails the test.

## Why the scripts say `--configLoader native`

Vite and Vitest normally bundle `vite.config.js` into `node_modules/.vite-temp` before
loading it. In this workspace `node_modules` is shared between projects and mounted
read-only, so the scripts ask them to import the config file directly, which works for
plain JavaScript configs like these. For the same reason both configs keep their caches
in `.vite-cache/` instead of `node_modules`.
