/**
 * A content loader that runs once per process in production. A build
 * prerenders every page from the same files, and next start serves those
 * pages as built, so there the files can't change under what's shown. React's
 * cache() lasts only one render, and every Learn page's layout reads every
 * course, so without this a build read all of content/learn once per page.
 * In dev each request loads again, so content edits show on a reload. Server
 * only. Callers share what it returns, so they must not change it.
 */
export function loadOnce<A extends string[], T>(load: (...args: A) => Promise<T>): (...args: A) => Promise<T> {
  if (process.env.NODE_ENV !== "production") return load;
  const loaded = new Map<string, Promise<T>>();
  return (...args: A) => {
    const key = args.join("\0");
    let found = loaded.get(key);
    if (!found) {
      found = load(...args);
      // A load that fails isn't kept, so the next call reads again.
      found.catch(() => loaded.delete(key));
      loaded.set(key, found);
    }
    return found;
  };
}
