"use client";

import { useSyncExternalStore } from "react";
import { STDIN, stdinStored, type StdinPage } from "@/lib/stdin-shown";

/** The program's input under an editor or at the top of its output (stdin,
    the Arguments field), in the compiler and Learn. */

const CHANGED = "hu:stdin-shown";

function isOpen(page: StdinPage): boolean {
  const marked = document.documentElement.hasAttribute(STDIN[page].attr);
  return STDIN[page].openByDefault ? !marked : marked;
}

/** Opens or folds a page's stdin: marks <html> right away (the rows follow
    it by CSS), saves it, and tells the page. */
export function setStdinOpen(page: StdinPage, open: boolean) {
  const { key, attr, openByDefault } = STDIN[page];
  const d = document.documentElement;
  if (open === openByDefault) d.removeAttribute(attr);
  else d.setAttribute(attr, "");
  try {
    if (open === openByDefault) localStorage.removeItem(key);
    else localStorage.setItem(key, stdinStored(page));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(CHANGED));
}

function subscribe(notify: () => void) {
  // Another tab changed it: follow along.
  const onStorage = (e: StorageEvent) => {
    const page = (Object.keys(STDIN) as StdinPage[]).find((p) => STDIN[p].key === e.key);
    if (!page) return;
    if (e.newValue === stdinStored(page)) document.documentElement.setAttribute(STDIN[page].attr, "");
    else document.documentElement.removeAttribute(STDIN[page].attr);
    notify();
  };
  window.addEventListener(CHANGED, notify);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGED, notify);
    window.removeEventListener("storage", onStorage);
  };
}

/** Whether a page's stdin is open, read from <html>, so the first render
    after a reload has it, and the server's markup, and hydration, have the
    default (the rows look right either way, by the stdin-open: and
    stdin-closed: variants). */
export function useStdinOpen(page: StdinPage): boolean {
  return useSyncExternalStore(subscribe, () => isOpen(page), () => STDIN[page].openByDefault);
}

/** The rows the open stdin field shows: its lines (a last newline making
    none), one at least, two at most (it scrolls past that), so there's no
    empty line under a one-line input. */
export function stdinRows(text: string): number {
  return Math.min(2, Math.max(1, text.replace(/\n$/, "").split("\n").length));
}

/** The rounding of the program input rows' focus rings (stdin's toggle, the
    Arguments field) at their box's corners, since the box clips what's
    outside them. Under the editor the rows are the code box's last ones, so
    only their bottom corners round, and only while stdin is folded. In the
    output (stacked) they're a box of their own, the first row rounding at
    the top too, and all round while it's folded with nothing under it. By
    the stdin variants, so it's right from first paint. Written out whole,
    for Tailwind. */
const CORNERS = {
  editor: {
    whole: "stdin-closed:rounded-b-[calc(var(--radius-card)-1px)]",
    left: "stdin-closed:rounded-bl-[calc(var(--radius-card)-1px)]",
    right: "stdin-closed:rounded-br-[calc(var(--radius-card)-1px)]",
  },
  output: {
    whole: "stdin-closed:rounded-[calc(var(--radius-card)-1px)] stdin-open:rounded-t-[calc(var(--radius-card)-1px)]",
    left: "stdin-closed:rounded-l-[calc(var(--radius-card)-1px)] stdin-open:rounded-tl-[calc(var(--radius-card)-1px)]",
    right: "stdin-closed:rounded-r-[calc(var(--radius-card)-1px)] stdin-open:rounded-tr-[calc(var(--radius-card)-1px)]",
  },
  // In the output with another row under it (Bash's files): the top only.
  above: {
    whole: "rounded-t-[calc(var(--radius-card)-1px)]",
    left: "rounded-tl-[calc(var(--radius-card)-1px)]",
    right: "rounded-tr-[calc(var(--radius-card)-1px)]",
  },
} as const;

export type InputPlace = "editor" | "output";

/** The first row's corners, for the whole of it or its left or right half
    (beside the Arguments field), with `rowBelow` when another row always
    follows it. */
export function inputCorners(place: InputPlace, part: "whole" | "left" | "right", { rowBelow = false } = {}): string {
  return CORNERS[place === "output" && rowBelow ? "above" : place][part];
}
