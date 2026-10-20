// Money as whole cents. Prices are stored and added as integers, and only the views turn them
// into "12.50", so totals never pick up float errors like 0.1 + 0.2.
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

/** 1250 becomes "12.50", the API's money format: no symbol, always two decimals. */
export function formatCents(amount: Cents): string {
  const sign = amount < 0 ? "-" : "";
  const whole = Math.abs(amount);
  return `${sign}${Math.floor(whole / 100)}.${String(whole % 100).padStart(2, "0")}`;
}
