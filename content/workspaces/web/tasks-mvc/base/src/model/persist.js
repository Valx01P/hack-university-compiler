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
  let raw;
  try {
    // Even reading can throw, when the browser blocks storage for this page.
    raw = (storage ?? localStorage).getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;

  try {
    const data = JSON.parse(raw);
    if (Array.isArray(data) && data.every(isTask)) return data.map(pick);
  } catch {
    // Not JSON at all: treated below like any other data of the wrong shape.
  }
  console.warn(`Ignoring saved tasks that are not in the ${STORAGE_KEY} shape.`);
  return null;
}

/**
 * Saves the tasks, replacing what was saved before.
 * @param {readonly import("./task-store.js").Task[]} tasks
 * @param {Storage} [storage] localStorage, unless a test passes another
 * @returns {boolean} false when the browser refused, because storage is full or blocked
 */
export function saveTasks(tasks, storage) {
  try {
    const target = storage ?? localStorage;
    target.setItem(STORAGE_KEY, JSON.stringify(tasks.map(pick)));
    return true;
  } catch {
    return false;
  }
}

function isTask(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.done === "boolean"
  );
}

/** Keeps only the fields a task has, so stray properties are never saved or loaded. */
function pick({ id, title, done }) {
  return { id, title, done };
}
