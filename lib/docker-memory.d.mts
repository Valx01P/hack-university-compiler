// Types for lib/docker-memory.mjs (plain JavaScript so scripts/up.mjs can use it before npm install).
export const MEMORY_FLOOR_BYTES: number;
export function belowFloor(memTotal: number): boolean;
export function formatGiB(bytes: number): string;
