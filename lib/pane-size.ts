"use client";

import { useSyncExternalStore } from "react";
import { PANES, foldOf, paneKey, paneVar, type PaneName } from "@/lib/panes";

/**
 * Saving and reading the sizes in lib/panes.ts. Setting one writes its
 * variable on <html> right away (the layout follows it, mid-drag too), tells
 * every border that reads it, and saves it a moment after it stops changing
 * (a drag sets it every frame), for this tab and others. Sizes keep two
 * decimals, so a border follows the pointer exactly rather than in whole
 * percent steps. The hook reads the variable, so the first render after a
 * reload already has your size, and the server's markup, and hydration,
 * have the default.
 */

const changed = (name: PaneName) => `hu:pane-${name}-changed`;

// In its range, or exactly its fold, to two decimals.
function clamp(name: PaneName, value: unknown): number {
  const p = PANES[name];
  const n = Math.round(Number(value) * 100) / 100;
  if (!Number.isFinite(n)) return p.initial;
  return n === foldOf(name)?.at ? n : Math.min(p.max, Math.max(p.min, n));
}

function apply(name: PaneName, value: number) {
  const p = PANES[name];
  const d = document.documentElement;
  if (value === p.initial) d.style.removeProperty(paneVar(name));
  else d.style.setProperty(paneVar(name), `${value}${p.unit}`);
  const fold = foldOf(name);
  if (fold) {
    if (value === fold.at) d.setAttribute(fold.attr, "");
    else d.removeAttribute(fold.attr);
  }
}

function current(name: PaneName): number {
  const raw = document.documentElement.style.getPropertyValue(paneVar(name)).trim();
  return raw ? clamp(name, Number.parseFloat(raw)) : PANES[name].initial;
}

const saving = new Map<PaneName, { timer: number; value: number }>();

function save(name: PaneName, value: number) {
  saving.delete(name);
  try {
    if (value === PANES[name].initial) localStorage.removeItem(paneKey(name));
    else localStorage.setItem(paneKey(name), String(value));
  } catch {
    /* ignore */
  }
}

/** Saves what a drag left unsaved (the page going away mid-pause). */
function saveAll() {
  for (const [name, { timer, value }] of saving) {
    window.clearTimeout(timer);
    save(name, value);
  }
}
if (typeof window !== "undefined") window.addEventListener("pagehide", saveAll);

let holds = 0;
const held = new Set<PaneName>();

/**
 * While a border is being dragged: its size still applies at once (the
 * layout follows the variable), but what reads it in React hears once, when
 * it's let go. Re-rendering a page every frame (the compiler's, its
 * cheatsheet's code highlighted again each time) made a drag stutter. Call
 * the returned function on release.
 */
export function holdPaneUpdates(): () => void {
  holds++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--holds > 0) return;
    for (const name of held) window.dispatchEvent(new Event(changed(name)));
    held.clear();
  };
}

/** Sets a pane's size (kept in its range), saves it, and returns it. */
export function setPaneSize(name: PaneName, value: number): number {
  const next = clamp(name, value);
  if (next === current(name) && !saving.has(name)) return next;
  apply(name, next);
  window.clearTimeout(saving.get(name)?.timer);
  saving.set(name, { timer: window.setTimeout(() => save(name, next), 200), value: next });
  if (holds > 0) held.add(name);
  else window.dispatchEvent(new Event(changed(name)));
  return next;
}

const subscribers = new Map<PaneName, (notify: () => void) => () => void>();
function subscribe(name: PaneName) {
  let fn = subscribers.get(name);
  if (!fn) {
    fn = (notify) => {
      const onStorage = (e: StorageEvent) => {
        if (e.key !== paneKey(name)) return;
        apply(name, e.newValue === null ? PANES[name].initial : clamp(name, e.newValue));
        notify();
      };
      window.addEventListener(changed(name), notify);
      window.addEventListener("storage", onStorage);
      return () => {
        window.removeEventListener(changed(name), notify);
        window.removeEventListener("storage", onStorage);
      };
    };
    subscribers.set(name, fn);
  }
  return fn;
}

/** A pane's size, any tab. */
export function usePaneSize(name: PaneName): number {
  return useSyncExternalStore(subscribe(name), () => current(name), () => PANES[name].initial);
}
