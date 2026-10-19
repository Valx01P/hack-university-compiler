// Types for lib/docker-memory.mjs (plain JavaScript so scripts/up.mjs can use it before npm install).
export const MEMORY_FLOOR_BYTES: number;
export const MEMORY_RECOMMENDED_BYTES: number;
export const RECOMMEND_FROM_HOST_BYTES: number;
export function belowFloor(memTotal: number): boolean;
export function recommendMore(memTotal: number, hostBytes: number): boolean;
export function formatGiB(bytes: number): string;
