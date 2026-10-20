/**
 * The JSON expectations of `http` check steps (architecture §6.8): a subset
 * match where strings like "$int" stand for a kind of value, and the values a
 * step saves for later steps ({{id}}). Every message names the JSON path that
 * failed, so a learner sees "$.items[2].title: expected a string".
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RFC3339 = /^\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/;

const show = (v: unknown) => (v === undefined ? "nothing" : JSON.stringify(v));

function special(expected: string, actual: unknown, at: string): string | null | undefined {
  if (!expected.startsWith("$")) return undefined;
  switch (expected) {
    case "$any":
      return actual === undefined ? `${at}: expected a value, got nothing` : null;
    case "$absent":
      return actual === undefined ? null : `${at}: expected nothing, got ${show(actual)}`;
    case "$int":
      return Number.isInteger(actual) ? null : `${at}: expected a whole number, got ${show(actual)}`;
    case "$number":
      return typeof actual === "number" ? null : `${at}: expected a number, got ${show(actual)}`;
    case "$string":
      return typeof actual === "string" ? null : `${at}: expected a string, got ${show(actual)}`;
    case "$bool":
      return typeof actual === "boolean" ? null : `${at}: expected true or false, got ${show(actual)}`;
    case "$uuid":
      return typeof actual === "string" && UUID.test(actual) ? null : `${at}: expected a UUID, got ${show(actual)}`;
    case "$rfc3339":
      return typeof actual === "string" && RFC3339.test(actual) ? null : `${at}: expected an RFC 3339 time, got ${show(actual)}`;
  }
  const len = /^\$len:(\d+)$/.exec(expected);
  if (len) {
    const n = Number(len[1]);
    const size = Array.isArray(actual) || typeof actual === "string" ? actual.length : null;
    return size === n ? null : `${at}: expected ${n} items, got ${size === null ? show(actual) : size}`;
  }
  return undefined;
}

/** null when `actual` matches `expected`, else why not. `exact` also refuses extra object keys. */
export function matchJson(expected: unknown, actual: unknown, exact = false, at = "$"): string | null {
  if (typeof expected === "string") {
    const s = special(expected, actual, at);
    if (s !== undefined) return s;
  }
  if (expected === null || typeof expected !== "object") {
    return Object.is(expected, actual) ? null : `${at}: expected ${show(expected)}, got ${show(actual)}`;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return `${at}: expected a list, got ${show(actual)}`;
    if (actual.length !== expected.length) return `${at}: expected ${expected.length} items, got ${actual.length}`;
    for (let i = 0; i < expected.length; i++) {
      const m = matchJson(expected[i], actual[i], exact, `${at}[${i}]`);
      if (m) return m;
    }
    return null;
  }
  if (actual === null || typeof actual !== "object" || Array.isArray(actual)) return `${at}: expected an object, got ${show(actual)}`;
  const obj = actual as Record<string, unknown>;
  for (const [key, want] of Object.entries(expected as Record<string, unknown>)) {
    const m = matchJson(want, Object.hasOwn(obj, key) ? obj[key] : undefined, exact, `${at}.${key}`);
    if (m) return m;
  }
  if (exact) {
    for (const key of Object.keys(obj)) {
      if (!Object.hasOwn(expected as object, key)) return `${at}.${key}: not expected, got ${show(obj[key])}`;
    }
  }
  return null;
}

/** A value at a JSONPath like $.items[0].id (the subset save uses), or undefined. */
export function jsonPath(value: unknown, expr: string): unknown {
  if (!expr.startsWith("$")) return undefined;
  const parts = expr.slice(1).match(/\.[^.[\]]+|\[\d+\]/g) ?? [];
  let at: unknown = value;
  for (const part of parts) {
    if (at === null || typeof at !== "object") return undefined;
    at = part.startsWith("[") ? (at as unknown[])[Number(part.slice(1, -1))] : (at as Record<string, unknown>)[part.slice(1)];
  }
  return at;
}

/** Replaces {{name}} with saved values, in strings and inside JSON. */
export function fill<T>(value: T, saved: Record<string, unknown>): T {
  if (typeof value === "string") {
    return value.replace(/\{\{([A-Za-z0-9_.-]+)\}\}/g, (all, name: string) => (Object.hasOwn(saved, name) ? String(saved[name]) : all)) as T;
  }
  if (Array.isArray(value)) return value.map((v) => fill(v, saved)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, fill(v, saved)])) as T;
  }
  return value;
}
