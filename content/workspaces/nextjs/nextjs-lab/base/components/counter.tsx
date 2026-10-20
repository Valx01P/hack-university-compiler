"use client";

import { useState } from "react";

// The count lives in this component's state, so it survives exactly as long as the
// component stays mounted: a layout keeps it across navigations, a template resets it.
export function Counter() {
  const [count, setCount] = useState(0);

  return (
    <button
      type="button"
      onClick={() => setCount((current) => current + 1)}
      className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium"
    >
      Clicked {count} {count === 1 ? "time" : "times"}
    </button>
  );
}
