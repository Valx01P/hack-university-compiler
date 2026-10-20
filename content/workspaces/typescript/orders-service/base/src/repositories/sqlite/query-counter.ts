// Counts the SQL statements each request runs. The HTTP middleware starts a count for every
// request (AsyncLocalStorage keeps concurrent requests apart), the SQLite repositories call
// countQuery() before each statement, and the access log prints the total. An N+1 query
// shows up as a count that grows with the page size.
import { AsyncLocalStorage } from "node:async_hooks";

const counts = new AsyncLocalStorage<{ count: number }>();

export function countQuery(): void {
  const current = counts.getStore();
  if (current) current.count++;
}

export const queryCounter = {
  /** Runs work with a fresh count. */
  track: <T>(work: () => T): T => counts.run({ count: 0 }, work),
  /** The statements counted so far in the current request. */
  current: (): number => counts.getStore()?.count ?? 0,
};
