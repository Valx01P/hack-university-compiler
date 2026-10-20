// The footer View: the count of tasks left, which filter link is current, and
// whether Clear completed is worth showing.

import { qs } from "../lib/dom.js";
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

  // TODO (part 4): give the link of the current filter aria-current="page", and take it off
  // the others. Then show #clear-completed only while some task is done.
}
