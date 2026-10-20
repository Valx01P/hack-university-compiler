// The Controller: turns what the user does into calls on the store, and keeps
// the screen state that is not task data (the filter, editing, focus) in step.
//
//   event -> TaskController -> TaskStore -> subscribers -> render()
//
// It never edits task data itself, and it never builds markup: the store owns
// the data and the views own the markup.

import { renderFooter } from "../view/footer-view.js";
import { renderTasks } from "../view/task-view.js";

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

    // TODO (part 1): when #new-task is submitted, add its title to the store instead of
    // letting the browser reload the page (event.preventDefault()). Then empty the field,
    // and keep focus in it for the next task.

    // TODO (part 2): the rows come and go, so listen on this.#list once for all of them
    // (delegate() in lib/dom.js), and use rowOf() to find a control's task id:
    // - a click on [data-action="toggle"], "edit", or "delete" toggles, starts editing, or deletes
    // - a double-click on .task-title starts editing too (startEditing() in task-view.js)
    // - in .task-title-input, Enter saves with store.rename() and Escape cancels (stopEditing())
    // Afterwards, put focus where a keyboard user expects it (focusTask() in task-view.js).

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
}
