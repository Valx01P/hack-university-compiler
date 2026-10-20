// Testing a hook that reads the URL: renderHook with a memory router around it, so the hook gets
// real search params, and router.state.location shows what it wrote.
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { expect, test } from "vitest";
import { useTaskFilters } from "./use-task-filters";

function renderFilters(url: string) {
  let router!: ReturnType<typeof createMemoryRouter>;
  function wrapper({ children }: { children: ReactNode }) {
    router ??= createMemoryRouter([{ path: "*", element: children }], { initialEntries: [url] });
    return <RouterProvider router={router} />;
  }
  const hook = renderHook(() => useTaskFilters(), { wrapper });
  return { ...hook, search: () => router.state.location.search };
}

test("defaults: no filters, sorted by due date, page 1", () => {
  const { result } = renderFilters("/projects/1");
  expect(result.current.filters).toEqual({ sort: "due", page: 1 });
  expect(result.current.activeCount).toBe(0);
});

test("reads the filters from the URL and ignores nonsense", () => {
  const { result } = renderFilters("/projects/1?status=doing&assignee=2&q=login&sort=priority&page=0");
  expect(result.current.filters).toEqual({ status: "doing", assignee: 2, q: "login", sort: "priority", page: 1 });
  expect(renderFilters("/projects/1?status=blocked&sort=password").result.current.filters).toEqual({ sort: "due", page: 1 });
});

test("setting a filter writes it and goes back to page 1", () => {
  const { result, search } = renderFilters("/projects/1?page=2");
  act(() => result.current.setFilter("status", "todo"));
  expect(search()).toBe("?status=todo");
  expect(result.current.filters.status).toBe("todo");
});

test("defaults stay out of the URL", () => {
  const { result, search } = renderFilters("/projects/1?sort=title");
  act(() => result.current.setFilter("sort", "due"));
  expect(search()).toBe("");
});

test("clearing removes every filter but keeps the sort", () => {
  const { result, search } = renderFilters("/projects/1?status=todo&q=login&sort=title");
  act(() => result.current.clearFilters());
  expect(search()).toBe("?sort=title");
});
