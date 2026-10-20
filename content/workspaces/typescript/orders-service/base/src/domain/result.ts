// Success or failure as a value. A function that can fail in an expected way (an unknown
// order, a pending order that cannot ship) returns a Result, so the caller has to check ok
// before it can use the value, and the compiler makes sure it did.
export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
