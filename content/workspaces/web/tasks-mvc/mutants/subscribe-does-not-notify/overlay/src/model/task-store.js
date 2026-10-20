// The Model: the list of tasks, and the only code allowed to change it.
//
// Every change builds a new array instead of editing the old one, then calls
// each subscriber with it. The views re-render and persistence saves because
// they subscribed, so nothing in this file knows about the DOM or localStorage.

import { newId } from "../lib/ids.js";

/** @typedef {{ id: string, title: string, done: boolean }} Task */

/** Which tasks each filter shows, keyed by the name used in ?filter=. */
export const FILTERS = Object.freeze({
  all: () => true,
  active: (task) => !task.done,
  completed: (task) => task.done,
});

/** Whether value names one of the FILTERS. */
export function isFilter(value) {
  return typeof value === "string" && Object.hasOwn(FILTERS, value);
}

/** The tasks a filter shows, in list order. */
export function filterTasks(tasks, filter) {
  return tasks.filter(FILTERS[filter] ?? FILTERS.all);
}

/** How many tasks are not done yet. */
export function countActive(tasks) {
  return tasks.filter(FILTERS.active).length;
}

export class TaskStore {
  /** @type {readonly Task[]} */
  #tasks;
  #listeners = new Set();
  #createId;

  /**
   * @param {readonly Task[]} [tasks] the starting list, copied so the caller's array is never shared
   * @param {{ createId?: () => string }} [options] tests pass an id maker that gives predictable ids
   */
  constructor(tasks = [], { createId = newId } = {}) {
    this.#tasks = freeze(tasks.map((task) => ({ ...task })));
    this.#createId = createId;
  }

  /** The current list. It is frozen: change it through the methods below. */
  get tasks() {
    return this.#tasks;
  }

  /**
   * Adds a task to the end of the list.
   * @returns {Task | null} the new task, or null when the title is blank
   */
  add(title) {
    const clean = title.trim();
    if (clean === "") return null;
    const task = { id: this.#createId(), title: clean, done: false };
    this.#commit([...this.#tasks, task]);
    return task;
  }

  /**
   * Marks a task done, or not done again.
   * @returns {boolean} whether a task changed
   */
  toggle(id) {
    return this.#update(id, (task) => ({ ...task, done: !task.done }));
  }

  /**
   * Changes a task's title. A blank title removes the task, the way clearing
   * a line removes it in most list apps.
   * @returns {boolean} whether the list changed
   */
  rename(id, title) {
    const clean = title.trim();
    if (clean === "") return this.remove(id);
    return this.#update(id, (task) => (task.title === clean ? task : { ...task, title: clean }));
  }

  /**
   * @returns {boolean} whether a task was removed
   */
  remove(id) {
    return this.#commitRemoval(this.#tasks.filter((task) => task.id !== id));
  }

  /**
   * Removes every task that is done.
   * @returns {boolean} whether any task was removed
   */
  clearCompleted() {
    return this.#commitRemoval(this.#tasks.filter((task) => !task.done));
  }

  /**
   * Calls listener(tasks) after every change. It is not called with the
   * current list, so a caller that needs it renders once when it starts.
   * @param {(tasks: readonly Task[]) => void} listener
   * @returns {() => void} a function that stops the calls
   */
  subscribe(listener) {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  #update(id, change) {
    let changed = false;
    const next = this.#tasks.map((task) => {
      if (task.id !== id) return task;
      const updated = change(task);
      if (updated !== task) changed = true;
      return updated;
    });
    if (changed) this.#commit(next);
    return changed;
  }

  #commitRemoval(next) {
    if (next.length === this.#tasks.length) return false;
    this.#commit(next);
    return true;
  }

  #commit(next) {
    this.#tasks = freeze(next);
  }
}

/** Freezes each task and the array, so code outside the store cannot change them. */
function freeze(tasks) {
  for (const task of tasks) Object.freeze(task);
  return Object.freeze(tasks);
}
