"use client";

import { useEffect } from "react";
import { useTooltipsHidden } from "@/lib/theme";

// Where a title waits while tooltips are hidden, and the mark on a control
// that was given its title as its name meanwhile.
const KEPT = "data-hu-title";
const NAMED = "data-hu-title-named";

/** Moves an element's title aside. A control named only by its title (an
    icon button: no aria name, no alt, no text) keeps it as its aria-label,
    so screen readers still name it. */
function stash(el: Element) {
  const title = el.getAttribute("title");
  if (title === null) return;
  el.removeAttribute("title");
  el.setAttribute(KEPT, title);
  const unnamed =
    !el.hasAttribute("aria-label") && !el.hasAttribute("aria-labelledby") && !el.hasAttribute("alt") && !el.textContent?.trim();
  if (title && (el.hasAttribute(NAMED) || unnamed)) {
    el.setAttribute("aria-label", title);
    el.setAttribute(NAMED, "");
  }
}

/** Puts a title back, and takes back the name it lent. */
function restore(el: Element) {
  const title = el.getAttribute(KEPT);
  el.removeAttribute(KEPT);
  if (title !== null && !el.hasAttribute("title")) el.setAttribute("title", title);
  if (el.hasAttribute(NAMED)) {
    el.removeAttribute(NAMED);
    if (el.getAttribute("aria-label") === title) el.removeAttribute("aria-label");
  }
}

function stashAll(root: Element) {
  if (root.hasAttribute("title")) stash(root);
  root.querySelectorAll("[title]").forEach(stash);
}

/**
 * While Hide tooltips is on (lib/theme.ts), keeps every hover tooltip in the
 * app from showing. They're all title attributes, so each one moves to
 * data-hu-title, on the page as it is and on everything it renders or changes
 * after, and comes back when the switch goes off. A preview of your own site
 * keeps its tooltips, since it's in its own frame.
 */
export function TooltipGuard() {
  const hidden = useTooltipsHidden();
  useEffect(() => {
    if (!hidden) return;
    const root = document.body;
    stashAll(root);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "attributes") {
          if (record.target instanceof Element) stash(record.target);
        } else {
          record.addedNodes.forEach((node) => node instanceof Element && stashAll(node));
        }
      }
    });
    observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["title"] });
    return () => {
      observer.disconnect();
      root.querySelectorAll(`[${KEPT}]`).forEach(restore);
    };
  }, [hidden]);
  return null;
}
