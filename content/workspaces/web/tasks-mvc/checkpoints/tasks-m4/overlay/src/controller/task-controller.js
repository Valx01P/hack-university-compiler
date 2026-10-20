// The Controller: turns what the user does into calls on the store, and keeps
// the screen state that is not task data (the filter, editing, focus) in step.
//
//   event -> TaskController -> TaskStore -> subscribers -> render()
//
// It never edits task data itself, and it never builds markup: the store owns
// the data and the views own the markup.

import { delegate } from "../lib/dom.js";
import { renderFooter } from "../view/footer-view.js";
import {
  focusTask,
  isEditing,
  renderTasks,
  rowOf,
  startEditing,
  stopEditing,
} from "../view/task-view.js";

export class TaskController {
  #store;
  #form;
  #list;
  #footer;
  #filter = "all";

  /**
   * @param {import("../model/task-store.js").TaskStore} store
   * @param {{ form: HTMLFormElement, list: HTMLUListElement, footer: HTMLElement }} elements
   */
  constructor(store, { form, list, footer }) {
    this.#store = store;
    this.#form = form;
    this.#list = list;
    this.#footer = footer;
  }

  /** Renders the first time and starts listening. Call it once. */
  start(filter = "all") {
    this.#filter = filter;
    this.#store.subscribe(() => this.render());

    this.#form.addEventListener("submit", (event) => this.#onSubmit(event));

    // The rows come and go, so one listener on the list handles them all.
    delegate(this.#list, "click", "[data-action]", (event, control) => this.#onAction(control));
    delegate(this.#list, "dblclick", ".task-title", (event, title) => this.#edit(rowOf(title).row));
    delegate(this.#list, "keydown", ".task-title-input", (event, input) =>
      this.#onEditKey(event, input),
    );
    // blur does not bubble, so delegation listens for focusout, which does.
    delegate(this.#list, "focusout", ".task-title-input", (event, input) =>
      this.#save(input, { refocus: false }),
    );

    // TODO (part 4): when a filter link in the footer is clicked, show that filter without
    // reloading the page: history.pushState() the link's URL, then render. Leave Ctrl-click,
    // Cmd-click, and middle clicks to the browser. Listen for popstate too, so Back and
    // Forward switch filters.

    // TODO (part 4): make #clear-completed remove every done task, then move focus to the
    // new task field, since the button hides once nothing is done.

    this.render();
  }

  /** Draws the list and the footer from the store and the current filter. */
  render() {
    const { tasks } = this.#store;
    renderTasks(this.#list, tasks, this.#filter);
    renderFooter(this.#footer, tasks, this.#filter);
  }

  get #titleInput() {
    return this.#form.elements.namedItem("title");
  }

  #onSubmit(event) {
    event.preventDefault();
    const input = this.#titleInput;
    if (this.#store.add(input.value)) input.value = "";
    input.focus();
  }

  #onAction(control) {
    const { row, id, index } = rowOf(control);
    switch (control.dataset.action) {
      case "toggle":
        this.#store.toggle(id);
        // Under the Active or Completed filter the row may have just left the list.
        this.#focus(id, index, "toggle");
        break;
      case "edit":
        this.#edit(row);
        break;
      case "delete":
        this.#store.remove(id);
        this.#focus(id, index, "toggle");
        break;
    }
  }

  #edit(row) {
    const task = this.#store.tasks.find((candidate) => candidate.id === row.dataset.id);
    if (task) startEditing(row, task.title);
  }

  #onEditKey(event, input) {
    // While an input method (for Japanese or Chinese, say) is composing, Enter
    // confirms the composition. It must not save the task as well.
    if (event.isComposing) return;
    if (event.key === "Enter") {
      // Saving moves focus to the row's Edit button. Without preventDefault,
      // this same Enter would go on to press that button and reopen the editor.
      event.preventDefault();
      this.#save(input, { refocus: true });
    } else if (event.key === "Escape") {
      this.#cancel(input);
    }
  }

  #save(input, { refocus }) {
    const { row, id, index } = rowOf(input);
    // Enter hides the field, which fires focusout too: only the first save counts.
    if (!isEditing(row)) return;
    stopEditing(row);
    this.#store.rename(id, input.value);
    if (refocus) this.#focus(id, index, "edit");
  }

  #cancel(input) {
    const { row, id, index } = rowOf(input);
    stopEditing(row);
    this.#focus(id, index, "edit");
  }

  /** Keeps keyboard users in place after a row changed, moved out, or was removed. */
  #focus(id, index, control) {
    if (!focusTask(this.#list, { id, index, control })) this.#titleInput.focus();
  }
}
