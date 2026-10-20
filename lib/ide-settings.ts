"use client";

import { useSyncExternalStore } from "react";

/**
 * The IDE's own settings (architecture §8.6), in the editor gear and stored
 * like the editor's: Auto save (on, after 1 second idle, decision D1),
 * Option as Meta in the terminal (on, so Alt+B and Alt+F move by word),
 * Terminal screen reader mode (off), and Show hidden files (off: .git and
 * the template's hidden paths stay out of the explorer).
 */
export interface IdeSettings {
  autosave: boolean;
  optionIsMeta: boolean;
  screenReader: boolean;
  hiddenFiles: boolean;
}

const KEY = "hu-ide-settings-v1";
const EVENT = "hu:ide-settings";
const DEFAULTS: IdeSettings = { autosave: true, optionIsMeta: true, screenReader: false, hiddenFiles: false };

let cached: IdeSettings | null = null;
let cachedRaw: string | null = null;

function read(): IdeSettings {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    /* blocked */
  }
  if (cached && raw === cachedRaw) return cached;
  cachedRaw = raw;
  try {
    const data = raw ? (JSON.parse(raw) as Partial<IdeSettings>) : {};
    cached = {
      autosave: data.autosave !== false,
      optionIsMeta: data.optionIsMeta !== false,
      screenReader: data.screenReader === true,
      hiddenFiles: data.hiddenFiles === true,
    };
  } catch {
    cached = DEFAULTS;
  }
  return cached;
}

export function setIdeSetting<K extends keyof IdeSettings>(key: K, value: IdeSettings[K]) {
  const next = { ...read(), [key]: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* blocked */
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(fn: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) fn();
  };
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", onStorage);
  };
}

export function useIdeSettings(): IdeSettings {
  return useSyncExternalStore(subscribe, read, () => DEFAULTS);
}

export function getIdeSettings(): IdeSettings {
  return typeof window === "undefined" ? DEFAULTS : read();
}
