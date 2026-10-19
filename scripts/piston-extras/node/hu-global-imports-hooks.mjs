// A bare import the program can't resolve on its own is retried from this
// runtime's lib folder, whose node_modules holds the global packages.
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (err) {
    if (err?.code !== "ERR_MODULE_NOT_FOUND" || /^(?:\.|\/|node:|file:|data:)/.test(specifier)) throw err;
    return next(specifier, { ...context, parentURL: import.meta.url });
  }
}
