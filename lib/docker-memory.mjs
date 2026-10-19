// Docker's memory, judged by one rule everywhere: npm run up, the runner, and
// the IDE warn below the same floor (PLAN.md D6). Every course works at
// 7.75 GiB, Docker Desktop's default, and a Mac with 32 GiB or more is better
// off giving Docker 16 GiB. Plain JavaScript, so scripts/up.mjs can use it
// before npm install has run.

const GiB = 1024 ** 3;

export const MEMORY_FLOOR_BYTES = 7.75 * GiB;
export const MEMORY_RECOMMENDED_BYTES = 16 * GiB;
export const RECOMMEND_FROM_HOST_BYTES = 32 * GiB;

// Docker reports the VM's MemTotal, which sits a few MiB under the slider's
// value (8,318,976,000 bytes at the default 7.75 GiB), so a VM set exactly at
// a threshold counts as reaching it.
const SLACK_BYTES = 128 * 1024 ** 2;

/** Whether Docker has less memory than the tested floor. */
export function belowFloor(memTotal) {
  return memTotal < MEMORY_FLOOR_BYTES - SLACK_BYTES;
}

/** Whether to suggest 16 GiB: a Mac with 32 GiB or more and a VM under 16 GiB. */
export function recommendMore(memTotal, hostBytes) {
  return hostBytes >= RECOMMEND_FROM_HOST_BYTES && memTotal < MEMORY_RECOMMENDED_BYTES - SLACK_BYTES;
}

/** Bytes as GiB for people, like "7.75 GiB". */
export function formatGiB(bytes) {
  return `${Number((bytes / GiB).toFixed(2))} GiB`;
}
