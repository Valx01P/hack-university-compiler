// The composition root: the one place that creates the store, finds the page's
// elements, and connects them. Every other module gets what it needs passed
// in, which keeps each one small and testable on its own.

import { TaskController } from "./controller/task-controller.js";
import { qs } from "./lib/dom.js";
import { SEED_TASKS } from "./model/seed.js";
import { TaskStore } from "./model/task-store.js";

// TODO (part 3): start from the saved tasks (loadTasks() in model/persist.js), and from
// SEED_TASKS only when nothing usable is saved. Then save the tasks after every change.
const store = new TaskStore(SEED_TASKS);

const controller = new TaskController(store, {
  form: qs("#new-task"),
  list: qs("#task-list"),
  footer: qs("#task-footer"),
});
// TODO (part 4): start on the filter named in the URL (?filter=active), when it is
// one of the FILTERS in task-store.js, and on "all" otherwise.
controller.start();
