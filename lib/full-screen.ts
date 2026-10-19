"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { urlParam, writeUrl } from "@/lib/url-state";

// One full screen for the whole app: turn it on in the compiler and Learn
// opens in it too, and the other way around. It lasts while you move around
// (languages, parts, between the two).
let full = false;
// Only a page load reads it from the address. After that, moving between
// pages (back and forward included) keeps what you last chose.
let seeded = false;
const listeners = new Set<() => void>();
const getFull = () => full;
function subscribe(notify: () => void) {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}
function setFullScreen(next: boolean) {
  if (next === full) return;
  full = next;
  for (const notify of listeners) notify();
}

/** Whether full screen is on, for parts of the page around the workspace. */
export function useIsFullScreen() {
  return useSyncExternalStore(subscribe, getFull, () => false);
}

// Things open that Escape should close first: a menu, a dialog or popover,
// or the code editor's completions or search box.
const TAKES_ESCAPE = '[role="menu"], [role="dialog"], [data-editor-overlay], [data-popup], .cm-tooltip-autocomplete, .cm-search';

/**
 * Full screen for the compiler and Learn: the workspace over the whole
 * window. It's in the address as ?full=1, so a reload opens straight into
 * it: the bootstrap in app/layout.tsx marks <html data-full> before first
 * paint, and globals.css lays the workspace out full screen from there,
 * before React does. Escape leaves it, unless something open takes the
 * Escape first or you're typing in a text field (the code editor isn't one:
 * Escape works there).
 */
export function useFullScreen() {
  const isFull = useIsFullScreen();
  const setFull = useCallback(
    (next: boolean | ((was: boolean) => boolean)) => setFullScreen(typeof next === "function" ? next(full) : next),
    []
  );

  // From the address, on load. Until it's applied, <html data-full> stays.
  const restoring = useRef(false);
  useLayoutEffect(() => {
    if (seeded) return;
    seeded = true;
    if (urlParam("full") === "1" && !full) {
      restoring.current = true;
      setFullScreen(true);
    }
  }, []);
  // Into the address, and onto <html> for the CSS.
  useLayoutEffect(() => {
    if (restoring.current && !isFull) return;
    restoring.current = false;
    document.documentElement.toggleAttribute("data-full", isFull);
    writeUrl({ full: isFull ? "1" : null });
  }, [isFull]);
  // A page that goes away takes <html data-full> with it (the next one sets
  // it again before it paints).
  useLayoutEffect(() => () => document.documentElement.removeAttribute("data-full"), []);

  useEffect(() => {
    if (!isFull) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || document.querySelector(TAKES_ESCAPE)) return;
      const focused = document.activeElement;
      if (focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement || focused instanceof HTMLSelectElement) return;
      setFull(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFull, setFull]);

  return [isFull, setFull] as const;
}
