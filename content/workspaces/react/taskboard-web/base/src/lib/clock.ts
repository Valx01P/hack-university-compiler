// "Now" for the whole app. When VITE_FIXED_NOW is set (vite.config.ts copies HU_FIXED_TIME into
// it, 2026-10-01T09:00:00Z in workspaces and tests), time stands still there, so due labels,
// tests, and checks never depend on the real date. Code that needs the time calls these,
// never new Date() or Date.now().
export function now(): Date {
  const fixed = import.meta.env.VITE_FIXED_NOW;
  return fixed ? new Date(fixed) : new Date();
}

/** Today's date in UTC as YYYY-MM-DD, the format of a task's due_on. */
export function todayISO(): string {
  return now().toISOString().slice(0, 10);
}
