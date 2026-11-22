// Docker's memory, judged by one rule everywhere: npm run up and the runner
// warn below the same floor (PLAN.md D6). Everything works at 7.75 GiB,
// Docker Desktop's default. Plain JavaScript, so scripts/up.mjs can use it
// before npm install has run.

const GiB = 1024 ** 3;

export const MEMORY_FLOOR_BYTES = 7.75 * GiB;

// Docker reports the VM's MemTotal, which sits a few MiB under the slider's
// value (8,318,976,000 bytes at the default 7.75 GiB), so a VM set exactly at
// a threshold counts as reaching it.
const SLACK_BYTES = 128 * 1024 ** 2;

/** Whether Docker has less memory than the tested floor. */
export function belowFloor(memTotal) {
  return memTotal < MEMORY_FLOOR_BYTES - SLACK_BYTES;
}

/** Bytes as GiB for people, like "7.75 GiB". */
export function formatGiB(bytes) {
  return `${Number((bytes / GiB).toFixed(2))} GiB`;
}
