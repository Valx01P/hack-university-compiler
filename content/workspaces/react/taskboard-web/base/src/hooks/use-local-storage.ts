// A value kept in localStorage that renders like state. useSyncExternalStore reads the stored
// string on every render and re-renders when it changes: in this tab through our own setter, and in
// other tabs through the browser's storage event, so two open tabs stay in step.
import { useSyncExternalStore } from "react";
import { writeJSON } from "@/lib/storage";

const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function parseOr<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function useLocalStorage<T>(key: string, fallback: T): [T, (value: T) => void] {
  // The raw string is the snapshot because strings compare by value, so React re-renders only when
  // the stored text changes. A missing or broken value reads as the fallback.
  const raw = useSyncExternalStore(subscribe, () => readRaw(key), () => null);
  const value = raw === null ? fallback : parseOr(raw, fallback);

  function setValue(next: T): void {
    writeJSON(key, next);
    for (const listener of listeners) listener();
  }

  return [value, setValue];
}
