// The footer View: the count of tasks left, which filter link is current, and
// whether Clear completed is worth showing.

import { qs, qsa } from "../lib/dom.js";
import { countActive } from "../model/task-store.js";

// Intl.PluralRules knows each language's plural forms. English needs two
// ("1 item", "2 items"), but other languages need up to six.
const pluralRules = new Intl.PluralRules("en-US");
const NOUNS = { one: "item", other: "items" };

/** "1 item left", "0 items left", "3 items left". */
export function itemsLeftText(count) {
  const noun = NOUNS[pluralRules.select(count)] ?? NOUNS.other;
  return `${count} ${noun} left`;
}

export function renderFooter(footer, tasks, filter) {
  footer.hidden = tasks.length === 0;
  qs(".task-count", footer).textContent = itemsLeftText(countActive(tasks));

  for (const link of qsa("a[data-filter]", footer)) {
    if (link.dataset.filter === filter) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }

  qs("#clear-completed", footer).hidden = !tasks.some((task) => task.done);
}
