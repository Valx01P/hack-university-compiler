"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { urlParam, writeUrl } from "@/lib/url-state";

/**
 * Full screen comes in two steps. The first click hides just the header
 * ("semi"): the page keeps its own bars (back and forward included), Learn's
 * lesson list stays where it is, and the theme button floats at the bottom
 * right. The second click covers the whole window with the workspace
 * ("full"), and the third goes back. One mode for the whole app: pick it in
 * the compiler and Learn opens in it too, and the other way around. It lasts
 * while you move around (languages, parts, between the two).
 */
export type ScreenMode = "off" | "semi" | "full";

let mode: ScreenMode = "off";
// Only a page load reads it from the address. After that, moving between
// pages (back and forward included) keeps what you last chose.
let seeded = false;
const listeners = new Set<() => void>();
const getMode = () => mode;
function subscribe(notify: () => void) {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}
function setMode(next: ScreenMode) {
  if (next === mode) return;
  mode = next;
  for (const notify of listeners) notify();
}

/** The next step of the full screen button: off, then semi, then full, then off. */
const NEXT: Record<ScreenMode, ScreenMode> = { off: "semi", semi: "full", full: "off" };

/** off, semi, or full, for parts of the page around the workspace. */
export function useScreenMode() {
  return useSyncExternalStore(subscribe, getMode, () => "off" as ScreenMode);
}

/** Whether the workspace covers the whole window (the second step). */
export function useIsFullScreen() {
  return useScreenMode() === "full";
}

/** The full screen button's label for each mode. */
export const FULL_SCREEN_TITLE: Record<ScreenMode, string> = {
  off: "Hide the header (click again for full screen)",
  semi: "Full screen",
  full: "Exit full screen",
};

// Things open that Escape should close first: a menu, a dialog or popover,
// or the code editor's completions or search box.
const TAKES_ESCAPE = '[role="menu"], [role="dialog"], [data-editor-overlay], [data-popup], .cm-tooltip-autocomplete, .cm-search';

/**
 * Full screen for the compiler and Learn. It's in the address, ?full=semi or
 * ?full=1, so a reload opens straight into it: the bootstrap in
 * app/layout.tsx marks <html data-semi> or <html data-full> before first
 * paint, and globals.css lays the page out from there, before React does.
 * Escape leaves either one, unless something open takes the Escape first or
 * you're typing in a text field (the code editor isn't one: Escape works
 * there). Returns whether the workspace covers the window, the button's next
 * step, and the mode.
 */
export function useFullScreen() {
  const current = useScreenMode();
  const step = useCallback(() => setMode(NEXT[mode]), []);

  // From the address, on load. Until it's applied, <html>'s mark stays.
  const restoring = useRef(false);
  useLayoutEffect(() => {
    if (seeded) return;
    seeded = true;
    const asked = urlParam("full");
    const wanted: ScreenMode = asked === "1" ? "full" : asked === "semi" ? "semi" : "off";
    if (wanted !== "off" && mode === "off") {
      restoring.current = true;
      setMode(wanted);
    }
  }, []);
  // Into the address, and onto <html> for the CSS.
  useLayoutEffect(() => {
    if (restoring.current && current === "off") return;
    restoring.current = false;
    document.documentElement.toggleAttribute("data-full", current === "full");
    document.documentElement.toggleAttribute("data-semi", current === "semi");
    writeUrl({ full: current === "full" ? "1" : current === "semi" ? "semi" : null });
  }, [current]);
  // A page that goes away takes <html>'s mark with it (the next one sets it
  // again before it paints).
  useLayoutEffect(
    () => () => {
      document.documentElement.removeAttribute("data-full");
      document.documentElement.removeAttribute("data-semi");
    },
    []
  );

  useEffect(() => {
    if (current === "off") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || document.querySelector(TAKES_ESCAPE)) return;
      const focused = document.activeElement;
      if (focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement || focused instanceof HTMLSelectElement) return;
      setMode("off");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current]);

  return [current === "full", step, current] as const;
}
