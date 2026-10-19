"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { urlParam, writeUrl } from "@/lib/url-state";

// Things open that Escape should close first: a menu, a dialog or popover,
// or the code editor's completions or search box.
const TAKES_ESCAPE = '[role="menu"], [role="dialog"], [data-editor-overlay], [data-popup], .cm-tooltip-autocomplete, .cm-search';

/**
 * Full screen for the compiler and Learn: the workspace over the whole
 * window. It lasts while you move around (kept in `session`), and it's in
 * the address as ?full=1, so a reload opens straight into it: the bootstrap
 * in app/layout.tsx marks <html data-full> before first paint, and
 * globals.css lays the workspace out full screen from there, before React
 * does. Escape leaves it, unless something open takes the Escape first or
 * you're typing in a text field (the code editor isn't one: Escape works
 * there).
 */
export function useFullScreen(session: { full: boolean }) {
  const [full, setFullState] = useState(() => session.full);
  const setFull = useCallback(
    (next: boolean | ((was: boolean) => boolean)) =>
      setFullState((was) => (session.full = typeof next === "function" ? next(was) : next)),
    [session]
  );

  // From the address, on load. Until it's applied, <html data-full> stays.
  const restoring = useRef(false);
  useLayoutEffect(() => {
    if (urlParam("full") === "1" && !session.full) {
      restoring.current = true;
      setFull(true);
    }
  }, [session, setFull]);
  // Into the address, and onto <html> for the CSS.
  useLayoutEffect(() => {
    if (restoring.current && !full) return;
    restoring.current = false;
    document.documentElement.toggleAttribute("data-full", full);
    writeUrl({ full: full ? "1" : null });
  }, [full]);
  // A page that goes away takes its full screen with it (the next one sets
  // its own before it paints).
  useLayoutEffect(() => () => document.documentElement.removeAttribute("data-full"), []);

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || document.querySelector(TAKES_ESCAPE)) return;
      const focused = document.activeElement;
      if (focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement || focused instanceof HTMLSelectElement) return;
      setFull(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full, setFull]);

  return [full, setFull] as const;
}
