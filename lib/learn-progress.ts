"use client";

import { useSyncExternalStore } from "react";

/**
 * Learn mode progress, kept in local storage like the rest of the app's state:
 * which practice problems you solved, the lesson you were last on, and your
 * code in each editor tab. A lesson is complete once every one of its practice
 * problems is solved. A `hu:learn-progress` event keeps every view in sync
 * same-tab, and `storage` syncs across tabs.
 */
const PROGRESS_PREFIX = "hu-learn-progress-v1:";
const PROGRESS_KEY = (lang: string) => `${PROGRESS_PREFIX}${lang}`;
const CODE_KEY = (lang: string, lesson: string, tab: string) => `hu-learn-code-v1:${lang}:${lesson}:${tab}`;
const EVENT = "hu:learn-progress";

interface Progress {
  solved: string[];
  last?: string;
}

function readRaw(lang: string): string | null {
  try {
    return localStorage.getItem(PROGRESS_KEY(lang));
  } catch {
    return null;
  }
}

function parse(raw: string | null): Progress {
  try {
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && Array.isArray(parsed.solved)) {
      return { solved: parsed.solved.filter((s: unknown) => typeof s === "string"), last: typeof parsed.last === "string" ? parsed.last : undefined };
    }
  } catch {
    /* fall through */
  }
  return { solved: [] };
}

function read(lang: string): Progress {
  return parse(readRaw(lang));
}

/** Calls `onChange` whenever saved progress changes, in this tab or another. */
function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key.startsWith(PROGRESS_PREFIX)) onChange();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function write(lang: string, progress: Progress) {
  try {
    localStorage.setItem(PROGRESS_KEY(lang), JSON.stringify(progress));
  } catch {
    /* storage full or blocked: progress just won't stick */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: lang }));
}

export function markSolved(lang: string, problemId: string) {
  const progress = read(lang);
  if (progress.solved.includes(problemId)) return;
  write(lang, { ...progress, solved: [...progress.solved, problemId] });
}

export function setLastLesson(lang: string, lessonId: string) {
  const progress = read(lang);
  if (progress.last === lessonId) return;
  write(lang, { ...progress, last: lessonId });
}

/** The lesson you were last on in this language, if any. Pass the course's
    lesson ids to ignore one that no longer exists (renamed or removed). */
export function lastLesson(lang: string, lessons?: readonly string[]): string | null {
  if (typeof window === "undefined") return null;
  const last = read(lang).last;
  return last && (!lessons || lessons.includes(last)) ? last : null;
}

/**
 * Where Learn picks up in a language: the lesson you were last on while it is
 * still in the course (`lessons`, in course order), else the first lesson, or
 * null without any. The server markup and the hydration render use the first
 * lesson, so they never depend on local storage. After that it follows saved
 * progress live.
 */
export function useResumeLesson(lang: string, lessons: readonly string[]): string | null {
  const first = lessons[0] ?? null;
  return useSyncExternalStore(
    subscribe,
    () => lastLesson(lang, lessons) ?? first,
    () => first
  );
}

export interface SolvedState {
  /** Solved problem ids. */
  solved: Set<string>;
  /** False until saved progress has been read: on the server and in the
      hydration render. */
  loaded: boolean;
}

const UNLOADED: SolvedState = { solved: new Set(), loaded: false };
const solvedCache = new Map<string, { raw: string | null; state: SolvedState }>();

/** The same object for as long as the stored progress is unchanged. */
function solvedSnapshot(lang: string): SolvedState {
  const raw = readRaw(lang);
  const cached = solvedCache.get(lang);
  if (cached && cached.raw === raw) return cached.state;
  const state = { solved: new Set(parse(raw).solved), loaded: true };
  solvedCache.set(lang, { raw, state });
  return state;
}

/**
 * Solved problem ids for a language, live, plus whether they have loaded.
 * The server markup and the hydration render never depend on local storage
 * (nothing solved, `loaded` false), so views that show progress keep the same
 * size either way. A view that mounts later, such as the lesson menu or a
 * page reached by a client-side navigation, gets the saved state on its first
 * render.
 */
export function useSolvedState(lang: string): SolvedState {
  return useSyncExternalStore(subscribe, () => solvedSnapshot(lang), () => UNLOADED);
}

/**
 * Your saved code for one editor tab of a lesson, or the fallback (the
 * original code). A saved copy of the original itself is dropped: older
 * versions saved one on Reset, and it would pin the tab to that version of
 * the example or starter after a later fix.
 */
export function loadCode(lang: string, lesson: string, tab: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  try {
    const saved = localStorage.getItem(CODE_KEY(lang, lesson, tab));
    if (saved === fallback) localStorage.removeItem(CODE_KEY(lang, lesson, tab));
    return saved ?? fallback;
  } catch {
    return fallback;
  }
}

export function saveCode(lang: string, lesson: string, tab: string, code: string) {
  try {
    localStorage.setItem(CODE_KEY(lang, lesson, tab), code);
  } catch {
    /* ignore */
  }
}

export function clearCode(lang: string, lesson: string, tab: string) {
  try {
    localStorage.removeItem(CODE_KEY(lang, lesson, tab));
  } catch {
    /* ignore */
  }
}
