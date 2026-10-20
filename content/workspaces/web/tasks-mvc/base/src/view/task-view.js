// The task list View: draws rows from tasks and manages what only the screen
// knows (editing mode, focus). It never changes tasks and never listens for
// events. The controller decides when to call it.

import { qs, qsa } from "../lib/dom.js";
import { filterTasks } from "../model/task-store.js";

/**
 * Makes list show the tasks that pass filter, in order.
 *
 * Rows are matched to tasks by data-id and updated in place, and only rows
 * that appear or disappear are added or removed. Rebuilding every row on each
 * change would look the same, but it would drop keyboard focus and swallow a
 * click whenever the list changed under the pointer.
 */
export function renderTasks(list, tasks, filter) {
  const visible = filterTasks(tasks, filter);
  const ids = new Set(visible.map((task) => task.id));
  for (const row of [...list.children]) {
    if (!ids.has(row.dataset.id)) row.remove();
  }

  const rows = new Map([...list.children].map((row) => [row.dataset.id, row]));
  visible.forEach((task, index) => {
    const row = rows.get(task.id) ?? createRow(list.ownerDocument);
    fillRow(row, task);
    const current = list.children[index] ?? null;
    if (row !== current) list.insertBefore(row, current);
  });
}

function createRow(page) {
  const template = qs("#task-item", page);
  return template.content.firstElementChild.cloneNode(true);
}

function fillRow(row, task) {
  const titleId = `task-${task.id}-title`;
  row.dataset.id = task.id;
  row.classList.toggle("is-done", task.done);

  const title = qs(".task-title", row);
  title.id = titleId;
  title.textContent = task.title;

  // The checkbox is named by the title, and each button is described by it,
  // so a screen reader says "Delete, button, Buy milk" instead of just "Delete".
  const toggle = qs(".task-toggle", row);
  toggle.checked = task.done;
  toggle.setAttribute("aria-labelledby", titleId);
  for (const button of qsa("button", row)) {
    button.setAttribute("aria-describedby", titleId);
  }
}

/** The row an element is in, its task id, and its position in the list. */
export function rowOf(element) {
  const row = element.closest(".task");
  const index = row.parentElement ? [...row.parentElement.children].indexOf(row) : -1;
  return { row, id: row.dataset.id, index };
}

/** Swaps a row's title for a text field holding title, and focuses the field. */
export function startEditing(row, title) {
  const input = qs(".task-title-input", row);
  input.value = title;
  row.classList.add("is-editing");
  input.focus();
  input.select();
}

export function stopEditing(row) {
  row.classList.remove("is-editing");
}

export function isEditing(row) {
  return row.classList.contains("is-editing");
}

/**
 * Focuses the control named by control (a data-action) in the row of task id.
 * When that task is no longer shown, it focuses the checkbox of the row that
 * took its place instead, or of the last row.
 * @returns {boolean} false when the list is empty and nothing was focused
 */
export function focusTask(list, { id, index, control }) {
  const rows = [...list.children];
  const same = rows.find((row) => row.dataset.id === id);
  const row = same ?? rows[Math.min(index, rows.length - 1)];
  if (row === undefined) return false;
  qs(`[data-action="${same ? control : "toggle"}"]`, row).focus();
  return true;
}
