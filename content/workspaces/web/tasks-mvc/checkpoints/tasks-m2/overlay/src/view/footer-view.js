// The footer View: the count of tasks left, which filter link is current, and
// whether Clear completed is worth showing.

import { qs } from "../lib/dom.js";
import { countActive } from "../model/task-store.js";

/** "1 item left", "0 items left", "3 items left". */
export function itemsLeftText(count) {
  // TODO (part 2): say "1 item left" for exactly one task. Intl.PluralRules("en-US") tells
  // you which form a number needs, which also works for languages with more than two.
  return `${count} items left`;
}

export function renderFooter(footer, tasks, filter) {
  footer.hidden = tasks.length === 0;
  qs(".task-count", footer).textContent = itemsLeftText(countActive(tasks));

  // TODO (part 4): give the link of the current filter aria-current="page", and take it off
  // the others. Then show #clear-completed only while some task is done.
}
