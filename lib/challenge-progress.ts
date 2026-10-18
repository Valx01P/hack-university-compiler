"use client";

import { useSyncExternalStore } from "react";

/**
 * Challenge progress in local storage, per language: the challenges you've
 * opened (viewed) and solved, and your code for each one. A
 * `hu:challenge-progress` event keeps every view in sync same-tab, and
 * `storage` syncs across tabs.
 */
const PREFIX = "hu-challenges-v1:";
const KEY = (lang: string) => `${PREFIX}${lang}`;
const CODE_KEY = (lang: string, id: string) => `hu-challenge-code-v1:${lang}:${id}`;
const EVENT = "hu:challenge-progress";

interface Stored {
  solved: string[];
  viewed: string[];
}

function readRaw(lang: string): string | null {
  try {
    return localStorage.getItem(KEY(lang));
  } catch {
    return null;
  }
}

function parse(raw: string | null): Stored {
  try {
    const p = raw ? JSON.parse(raw) : null;
    const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
    return { solved: list(p?.solved), viewed: list(p?.viewed) };
  } catch {
    return { solved: [], viewed: [] };
  }
}

function write(lang: string, next: Stored) {
  try {
    localStorage.setItem(KEY(lang), JSON.stringify(next));
  } catch {
    /* storage full or blocked: progress just won't stick */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: lang }));
}

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key.startsWith(PREFIX)) onChange();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function markChallengeViewed(lang: string, id: string) {
  const p = parse(readRaw(lang));
  if (p.viewed.includes(id)) return;
  write(lang, { ...p, viewed: [...p.viewed, id] });
}

export function markChallengeSolved(lang: string, id: string) {
  const p = parse(readRaw(lang));
  if (p.solved.includes(id)) return;
  write(lang, { solved: [...p.solved, id], viewed: p.viewed.includes(id) ? p.viewed : [...p.viewed, id] });
}

export interface ChallengeProgress {
  solved: Set<string>;
  viewed: Set<string>;
  /** False until saved progress has been read (server and hydration render). */
  loaded: boolean;
}

const UNLOADED: ChallengeProgress = { solved: new Set(), viewed: new Set(), loaded: false };
const cache = new Map<string, { raw: string | null; state: ChallengeProgress }>();

function snapshot(lang: string): ChallengeProgress {
  const raw = readRaw(lang);
  const hit = cache.get(lang);
  if (hit && hit.raw === raw) return hit.state;
  const p = parse(raw);
  const state = { solved: new Set(p.solved), viewed: new Set(p.viewed), loaded: true };
  cache.set(lang, { raw, state });
  return state;
}

/** Solved and viewed challenges for a language, live. Never read on the
    server, so the markup is the same either way. */
export function useChallengeProgress(lang: string): ChallengeProgress {
  return useSyncExternalStore(subscribe, () => snapshot(lang), () => UNLOADED);
}

/** Your saved code for a challenge, or the starter. */
export function loadChallengeCode(lang: string, id: string, starter: string): string {
  if (typeof window === "undefined") return starter;
  try {
    return localStorage.getItem(CODE_KEY(lang, id)) ?? starter;
  } catch {
    return starter;
  }
}

/** Saves your code for a challenge (the starter itself is never stored, so a
    reset really clears it). */
export function saveChallengeCode(lang: string, id: string, code: string, starter: string) {
  try {
    if (code === starter) localStorage.removeItem(CODE_KEY(lang, id));
    else localStorage.setItem(CODE_KEY(lang, id), code);
  } catch {
    /* ignore */
  }
}
