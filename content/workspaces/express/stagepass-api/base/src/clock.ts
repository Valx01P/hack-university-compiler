// Where "now" comes from. Every timestamp the app writes goes through now(), so freezing it
// with HU_FIXED_TIME (server.ts and the scripts call freezeClock) makes responses, rows, and
// tokens repeatable. Tests leave it unfrozen and move Date itself with vi.setSystemTime.
let frozenAt: number | null = null;

export function freezeClock(at: Date | null): void {
  frozenAt = at === null ? null : at.getTime();
}

export function now(): Date {
  // A new Date each call, so a caller that mutates its copy cannot move the clock.
  return frozenAt === null ? new Date() : new Date(frozenAt);
}
