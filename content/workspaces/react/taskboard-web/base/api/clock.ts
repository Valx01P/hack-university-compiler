// The API's clock. With HU_FIXED_TIME set (2026-10-01T09:00:00Z in workspaces, tests, and
// checks), every time the API writes is that instant, so new rows, completed_at, and session
// expiry are the same on every run. Without it, the API uses the real time.
export function now(): string {
  const fixed = process.env.HU_FIXED_TIME;
  const instant = fixed ? new Date(fixed) : new Date();
  return instant.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function hoursAfter(iso: string, hours: number): string {
  return new Date(Date.parse(iso) + hours * 3_600_000).toISOString().replace(/\.\d{3}Z$/, "Z");
}
