"use client";

import { useEffect, useState } from "react";

/**
 * Learn mode progress, kept in local storage like the rest of the app's state:
 * which practice problems you solved, the lesson you were last on, and your
 * code in each editor tab. A lesson is complete once every one of its practice
 * problems is solved. A `hu:learn-progress` event keeps every view in sync
 * same-tab, and `storage` syncs across tabs.
 */
const PROGRESS_KEY = (lang: string) => `hu-learn-progress-v1:${lang}`;
const CODE_KEY = (lang: string, lesson: string, tab: string) => `hu-learn-code-v1:${lang}:${lesson}:${tab}`;
const EVENT = "hu:learn-progress";

interface Progress {
  solved: string[];
  last?: string;
}

function read(lang: string): Progress {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY(lang));
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && Array.isArray(parsed.solved)) {
      return { solved: parsed.solved.filter((s: unknown) => typeof s === "string"), last: typeof parsed.last === "string" ? parsed.last : undefined };
    }
  } catch {
    /* fall through */
  }
  return { solved: [] };
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

/** The lesson you were last on in this language, if any. */
export function lastLesson(lang: string): string | null {
  if (typeof window === "undefined") return null;
  return read(lang).last ?? null;
}

/** Solved problem ids for a language, live. Empty until mounted, so the
    server markup never depends on local storage. */
export function useSolved(lang: string): Set<string> {
  const [solved, setSolved] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    const refresh = () => setSolved(new Set(read(lang).solved));
    refresh();
    const onEvent = (e: Event) => {
      if ((e as CustomEvent<string>).detail === lang) refresh();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === PROGRESS_KEY(lang)) refresh();
    };
    window.addEventListener(EVENT, onEvent);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT, onEvent);
      window.removeEventListener("storage", onStorage);
    };
  }, [lang]);
  return solved;
}

/** Your saved code for one editor tab of a lesson, or the fallback. */
export function loadCode(lang: string, lesson: string, tab: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  try {
    return localStorage.getItem(CODE_KEY(lang, lesson, tab)) ?? fallback;
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
