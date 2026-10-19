"use client";

import { useSyncExternalStore } from "react";

/**
 * Your edits to runnable snippets, saved in the browser until you reset them.
 * Each is stored under its page and a hash of the snippet's original code, so
 * an edit never lands on a different snippet if the content changes.
 */
const PREFIX = "hu-snippet-v1:";
const EVENT = "hu:snippet-edit";

/** A short, stable hash of a snippet's original code (FNV-1a). */
export function snippetHash(code: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < code.length; i++) {
    h ^= code.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
};

/** Saves an edit, or drops it (null) once the code matches the original. */
export function saveSnippetEdit(key: string, code: string | null) {
  try {
    if (code === null) localStorage.removeItem(PREFIX + key);
    else localStorage.setItem(PREFIX + key, code);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
}

const subscribe = (notify: () => void) => {
  const onStorage = (e: StorageEvent) => {
    if (e.key?.startsWith(PREFIX)) notify();
  };
  window.addEventListener(EVENT, notify);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, notify);
    window.removeEventListener("storage", onStorage);
  };
};

/** Your saved edit of a snippet, or null when it's untouched. */
export function useSnippetEdit(key: string): string | null {
  return useSyncExternalStore(subscribe, () => read(key), () => null);
}
