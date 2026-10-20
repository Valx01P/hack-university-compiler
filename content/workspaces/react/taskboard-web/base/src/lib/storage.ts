// localStorage with the failures handled. Reads fall back when a key is missing, holds broken
// JSON, or storage is blocked (some private windows throw on access), and writes ignore a full or
// blocked storage, so a settings problem never takes the app down. Keys carry a version: when a
// value's shape changes, bump it and old values are simply ignored.
export const storageKeys = {
  theme: "tb:theme:v1",
  density: "tb:density:v1",
} as const;

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Full or blocked storage: the app keeps working with the value in memory only.
  }
}
