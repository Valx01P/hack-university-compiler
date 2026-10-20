// Testing a hook with timers: renderHook mounts it in a tiny host component, rerender passes new
// props, and fake timers make "300 ms later" happen instantly and exactly.
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useDebouncedValue } from "./use-debounced-value";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

test("waits for the value to stop changing", () => {
  const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), { initialProps: { value: "g" } });
  expect(result.current).toBe("g");

  rerender({ value: "gr" });
  act(() => vi.advanceTimersByTime(200));
  rerender({ value: "grace" });
  act(() => vi.advanceTimersByTime(299));
  expect(result.current).toBe("g");

  act(() => vi.advanceTimersByTime(1));
  expect(result.current).toBe("grace");
});
