// Walks a cursor-paged list as one stream of items. It asks for the next page only when the
// caller wants more, so `for await ... break` after two items costs one request, not twelve.
import type { Page } from "./types.ts";

export async function* paginate<T>(fetchPage: (cursor: string | null) => Promise<Page<T>>): AsyncGenerator<T> {
  let cursor: string | null = null;
  do {
    const page = await fetchPage(cursor);
    // Yield this page's items before deciding whether there is another page.
    yield* page.items;
    cursor = page.nextCursor;
  } while (cursor !== null);
}
