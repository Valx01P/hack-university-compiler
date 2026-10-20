// What every parse function in the domain returns: the value, or a message for the user.
// The caller has to check ok before it can touch value, so bad input cannot slip through.
export type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };
