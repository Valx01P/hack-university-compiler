// Checks every command makes after util.parseArgs: options it cannot do without, whole
// numbers, and turning a failed parse into the error message the user sees.
import type { Parsed } from "#domain/index.ts";
import { InvalidInputError } from "../errors.ts";

export function required(value: string | undefined, option: string): string {
  if (value === undefined || value === "") throw new InvalidInputError(`Missing ${option}`);
  return value;
}

export function wholeNumber(text: string, option: string): number {
  if (!/^\d+$/.test(text)) throw new InvalidInputError(`Invalid ${option}: ${text} (expected a whole number)`);
  return Number(text);
}

export function unwrap<T>(parsed: Parsed<T>): T {
  if (parsed.ok === false) throw new InvalidInputError(parsed.error);
  return parsed.value;
}
