/**
 * Exactly where you were reading in each Learn part, and how far down each
 * course's lesson list was, saved in this browser, so a reload (or coming
 * back to a part later) opens right there. A part's place is the block at
 * the top of its view (a paragraph, a display, a heading, a list item) and
 * how far past that block's top you were, so it lands on the same words
 * even after the window changed size. The address keeps only which block
 * (#example, #practice, #recap, lib/url-state.ts), for a link to share.
 *
 * Plain functions (no React), so the server layout can import SCROLL_KEY:
 * the bootstrap in app/layout.tsx reads it before first paint: a
 * part with a saved place keeps its workspace hidden until it's back there
 * (data-restore), so the page never shows at the top and then jumps.
 */

export const SCROLL_KEY = "hu-learn-scroll-v1";
const LIST_KEY = "hu-learn-list-scroll-v1";
// The most parts remembered, the least recently read dropped first.
const LIMIT = 200;

/** A part's place: the index of the block at the top of the view among the
    part's blocks, how far past its top the view starts, the plain scroll
    offset as a fallback, and the address's #place when it was saved. */
export interface PartPlace {
  i: number;
  o: number;
  y: number;
  h: string;
}

type Store = Record<string, PartPlace & { t: number }>;

function read<T>(key: string): T | null {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null");
    return v && typeof v === "object" ? (v as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore: a full or blocked storage only loses the place */
  }
}

export function loadPartPlace(path: string): PartPlace | null {
  const p = read<Store>(SCROLL_KEY)?.[path];
  return p && Number.isFinite(p.y) && Number.isFinite(p.i) && Number.isFinite(p.o) ? p : null;
}

/** Saves a part's place, or forgets it at the very top (nothing to restore). */
export function savePartPlace(path: string, place: PartPlace | null) {
  const store = read<Store>(SCROLL_KEY) ?? {};
  if (!place || place.y <= 0) delete store[path];
  else store[path] = { ...place, t: Date.now() };
  const paths = Object.keys(store);
  if (paths.length > LIMIT) {
    paths.sort((a, b) => store[a].t - store[b].t);
    for (const p of paths.slice(0, paths.length - LIMIT)) delete store[p];
  }
  write(SCROLL_KEY, store);
}

/** The blocks a place can be measured from, in reading order. */
export const PLACE_BLOCKS = "h1, h2, h3, p, li, pre, table, figure, .math-display, .diagram, [id]";

export function loadListScroll(course: string): number | null {
  const y = read<Record<string, number>>(LIST_KEY)?.[course];
  return typeof y === "number" && Number.isFinite(y) && y > 0 ? y : null;
}

export function saveListScroll(course: string, y: number) {
  const store = read<Record<string, number>>(LIST_KEY) ?? {};
  if (y > 0) store[course] = Math.round(y);
  else delete store[course];
  write(LIST_KEY, store);
}
