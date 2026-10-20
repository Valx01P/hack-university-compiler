// Small helpers used around the app.

export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// Waits HU_RACE_DELAY_MS (0 by default). Tests set it to widen the gap between answering a
// request and finishing its work, so a race shows up every time.
export function raceWindow(): Promise<void> {
  return sleep(Number(process.env["HU_RACE_DELAY_MS"]) || 0);
}
