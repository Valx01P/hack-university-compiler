// Money as whole cents. Prices arrive as text ("12.50") and leave as text ("$12.50"), and in
// between they are integers, so adding and multiplying them never picks up float errors.
import type { Parsed } from "./parsed.ts";

// A brand: a number that is known to be a whole number of cents. Only the functions below
// make one, so a plain number (say, dollars) cannot be passed where cents are expected.
export type Cents = number & { readonly __brand: "Cents" };

export function isCents(value: number): value is Cents {
  return Number.isSafeInteger(value);
}

/** Checks a computed amount, for arithmetic that must stay in whole cents. */
export function cents(value: number): Cents {
  if (!isCents(value)) throw new RangeError(`Not a whole number of cents: ${value}`);
  return value;
}

export const ZERO_CENTS = cents(0);

export function addCents(a: Cents, b: Cents): Cents {
  return cents(a + b);
}

export function multiplyCents(price: Cents, quantity: number): Cents {
  return cents(price * quantity);
}

const PRICE = /^(\d+)(?:\.(\d{1,2}))?$/;

/** "12.5" or "12.50" becomes 1250. It reads the digits, so no float is ever involved. */
export function toCents(text: string): Parsed<Cents> {
  const match = PRICE.exec(text);
  if (!match) return { ok: false, error: `Invalid price: ${text} (expected dollars and cents, like 12.50)` };
  const dollars = match[1];
  const fraction = match[2];
  const value = Number(dollars) * 100 + Number(fraction.padEnd(2, "0"));
  return isCents(value) ? { ok: true, value } : { ok: false, error: `Invalid price: ${text} (too large)` };
}

/** 1299 becomes "$12.99", and 158755 becomes "$1,587.55". */
export function formatCents(amount: Cents): string {
  const sign = amount < 0 ? "-" : "";
  const whole = Math.abs(amount);
  const dollars = String(Math.floor(whole / 100)).replace(/\B(?=(\d{3})+$)/g, ",");
  return `${sign}$${dollars}.${String(whole % 100).padStart(2, "0")}`;
}

/** 158755 becomes "1587.55": no symbol and no commas, for files other programs read. */
export function centsToDecimal(amount: Cents): string {
  const sign = amount < 0 ? "-" : "";
  const whole = Math.abs(amount);
  return `${sign}${Math.floor(whole / 100)}.${String(whole % 100).padStart(2, "0")}`;
}
