// Reads Stockroom's settings from the environment once, at startup, and turns the strings
// into typed values. Nothing else reads process.env, so every setting is listed here.
import { resolve } from "node:path";
import { fixedClock, systemClock, type Clock } from "./clock.ts";
import { InvalidInputError } from "./errors.ts";

export type Config = {
  readonly dataPath: string;
  readonly lowStock: number;
  readonly clock: Clock;
};

export function loadConfig(env: Readonly<Record<string, string | undefined>>, cwd: string): Config {
  const data = env["STOCKROOM_DATA"];
  const lowStock = env["STOCKROOM_LOW_STOCK"];
  const fixedTime = env["HU_FIXED_TIME"];
  return {
    // Relative to the folder you run the command in.
    dataPath: resolve(cwd, data ?? "data/inventory.json"),
    lowStock: lowStock ? parseThreshold(lowStock) : 5,
    clock: fixedTime ? parseClock(fixedTime) : systemClock,
  };
}

function parseThreshold(text: string): number {
  if (!/^\d+$/.test(text)) throw new InvalidInputError(`STOCKROOM_LOW_STOCK must be a whole number, got "${text}"`);
  return Number(text);
}

function parseClock(text: string): Clock {
  if (Number.isNaN(Date.parse(text))) throw new InvalidInputError(`HU_FIXED_TIME must be an ISO time, got "${text}"`);
  return fixedClock(text);
}
