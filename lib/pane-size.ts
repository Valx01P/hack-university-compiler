"use client";

import { useSyncExternalStore } from "react";
import { PANES, paneKey, paneVar, type PaneName } from "@/lib/panes";

/**
 * Saving and reading the sizes in lib/panes.ts. Setting one writes its
 * variable on <html> right away (the layout follows it, mid-drag too), saves
 * it, and tells every border that reads it, in this tab and in others. The
 * hook reads the variable, so the first render after a reload already has
 * your size, and the server's markup, and hydration, have the default.
 */

const changed = (name: PaneName) => `hu:pane-${name}-changed`;

function clamp(name: PaneName, value: unknown): number {
  const p = PANES[name];
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(p.max, Math.max(p.min, n)) : p.initial;
}

function apply(name: PaneName, value: number) {
  const p = PANES[name];
  const d = document.documentElement;
  if (value === p.initial) d.style.removeProperty(paneVar(name));
  else d.style.setProperty(paneVar(name), `${value}${p.unit}`);
  if ("zeroAttr" in p) {
    if (value === 0) d.setAttribute(p.zeroAttr, "");
    else d.removeAttribute(p.zeroAttr);
  }
}

function current(name: PaneName): number {
  const raw = document.documentElement.style.getPropertyValue(paneVar(name)).trim();
  return raw ? clamp(name, Number.parseFloat(raw)) : PANES[name].initial;
}

/** Sets a pane's size (kept in its range), saves it, and returns it. */
export function setPaneSize(name: PaneName, value: number): number {
  const next = clamp(name, value);
  apply(name, next);
  try {
    if (next === PANES[name].initial) localStorage.removeItem(paneKey(name));
    else localStorage.setItem(paneKey(name), String(next));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(changed(name)));
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
