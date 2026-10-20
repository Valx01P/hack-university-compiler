// The playground API's storage: api/data/db.json, read on every request and written after every
// change (to a temporary file, then renamed, so a crash never leaves half a file). It starts as a
// copy of api/seed.json, and npm run api:reset or POST /_hu/reset copies the seed over it again.
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const SEED_FILE = join(here, "seed.json");
export const DB_FILE = join(here, "data", "db.json");

export interface Item {
  id: number;
  title: string;
  done: boolean;
  created_at: string;
  updated_at: string;
}

export interface Store {
  items: Item[];
  next_id: number;
}

export function readStore(): Store {
  if (!existsSync(DB_FILE)) resetStore();
  return JSON.parse(readFileSync(DB_FILE, "utf8")) as Store;
}

export function writeStore(store: Store): void {
  mkdirSync(dirname(DB_FILE), { recursive: true });
  const temp = `${DB_FILE}.${process.pid}.tmp`;
  const rows = store.items.map((item) => `    ${JSON.stringify(item)}`).join(",\n");
  writeFileSync(temp, `{\n  "items": [\n${rows}\n  ],\n  "next_id": ${store.next_id}\n}\n`);
  renameSync(temp, DB_FILE);
}

/** Copies the seed's bytes, so two resets in a row give byte-identical files. */
export function resetStore(): void {
  mkdirSync(dirname(DB_FILE), { recursive: true });
  const temp = `${DB_FILE}.${process.pid}.tmp`;
  copyFileSync(SEED_FILE, temp);
  renameSync(temp, DB_FILE);
}

/** The course's clock: HU_FIXED_TIME when set (2026-10-01T09:00:00Z in workspaces), else the real time. */
export function now(): string {
  const fixed = process.env.HU_FIXED_TIME;
  return (fixed ? new Date(fixed) : new Date()).toISOString().replace(/\.\d{3}Z$/, "Z");
}
