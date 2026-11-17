"use client";

import { useState } from "react";

/** Which one row of a list is open, if any, for the test cases in a check's
    results (Learn, the challenges, the IDE's Results): opening one closes
    the other, and clicking the open one closes it. A new `key` (a new
    check's results) starts them all closed. */
export function useOneOpen<K>(key: K) {
  const [state, setState] = useState<{ key: K; id: string | null }>({ key, id: null });
  const openId = state.key === key ? state.id : null;
  const toggle = (id: string) => setState({ key, id: openId === id ? null : id });
  return { openId, toggle };
}
