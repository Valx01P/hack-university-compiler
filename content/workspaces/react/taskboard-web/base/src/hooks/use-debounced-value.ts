// A copy of a value that changes only once the value has stopped changing for delayMs. Typing
// "grace" quickly then sends one search instead of five. Each change restarts the timer, and the
// effect's cleanup cancels the timer the next change replaces.
import { useEffect, useState } from "react";

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
