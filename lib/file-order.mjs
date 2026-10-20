// The order the explorer lists names in, shared by the build's starting trees
// (lib/workspace-layers.mjs) and the IDE: case-insensitive first, so
// README.md sits among the r's, then exactly, so User.ts and user.ts (two
// files on Linux) keep one order. Folders come before files, but that's the
// caller's to decide. Plain JavaScript, safe in the browser and in Node.

/** Compares two paths by their last segment. */
export function compareNames(a, b) {
  const x = a.slice(a.lastIndexOf("/") + 1);
  const y = b.slice(b.lastIndexOf("/") + 1);
  const lower = x.toLowerCase().localeCompare(y.toLowerCase(), "en");
  return lower || (x < y ? -1 : x > y ? 1 : 0);
}
