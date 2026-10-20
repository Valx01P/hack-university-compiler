// Saving and loading tasks in localStorage.
//
// The key names the version of the data's shape. If a task ever gains or loses
// a field, the app moves to tasks:v2 and converts v1 data once, instead of
// guessing what old data means.

export const STORAGE_KEY = "tasks:v1";

/**
 * Reads the saved tasks.
 * @param {Storage} [storage] localStorage, unless a test passes another
 * @returns {import("./task-store.js").Task[] | null} the tasks, or null when nothing usable is saved
 */
export function loadTasks(storage) {
  // TODO (part 3): read STORAGE_KEY from storage (localStorage when none is given) and return
  // the tasks. Return null when nothing is saved, and also when what is saved is not a JSON
  // array of { id, title, done } with the right types. Nothing here may throw: even reading
  // storage throws when the browser blocks it.
  return null;
}

/**
 * Saves the tasks, replacing what was saved before.
 * @param {readonly import("./task-store.js").Task[]} tasks
 * @param {Storage} [storage] localStorage, unless a test passes another
 * @returns {boolean} false when the browser refused, because storage is full or blocked
 */
export function saveTasks(tasks, storage) {
  // TODO (part 3): write the tasks to STORAGE_KEY as JSON and return true. Return false
  // instead of throwing when the browser refuses.
  return false;
}
