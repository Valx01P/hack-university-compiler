// The composition root: the one place that creates the store, finds the page's
// elements, and connects them. Every other module gets what it needs passed
// in, which keeps each one small and testable on its own.

import { TaskController } from "./controller/task-controller.js";
import { qs } from "./lib/dom.js";
import { loadTasks, saveTasks } from "./model/persist.js";
import { SEED_TASKS } from "./model/seed.js";
import { TaskStore } from "./model/task-store.js";

const store = new TaskStore(loadTasks() ?? SEED_TASKS);
store.subscribe((tasks) => saveTasks(tasks));

const controller = new TaskController(store, {
  form: qs("#new-task"),
  list: qs("#task-list"),
  footer: qs("#task-footer"),
});
// TODO (part 4): start on the filter named in the URL (?filter=active), when it is
// one of the FILTERS in task-store.js, and on "all" otherwise.
controller.start();
