// The board's and the list's filters live in the URL's search params, not in state: a filtered
// view survives a reload, can be shared as a link, and the back button undoes a filter. Values at
// their default (sort=due, page=1) stay out of the URL. Changing a filter goes back to page 1.
import { useSearchParams } from "react-router";
import { DEFAULT_FILTERS, parseTaskFilters } from "../api";
import type { TaskFilters } from "../types";

const PARAM: Record<keyof TaskFilters, string> = { status: "status", assignee: "assignee", q: "q", label: "label", sort: "sort", page: "page" };

export function useTaskFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = parseTaskFilters(searchParams);
  const activeCount = [filters.status, filters.assignee, filters.q, filters.label].filter((value) => value !== undefined).length;

  /** replace: true changes the URL without a new history entry, for typing in a search box. */
  function setFilter<K extends keyof TaskFilters>(key: K, value: TaskFilters[K] | undefined, { replace = false } = {}) {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value === undefined || value === "" || value === DEFAULT_FILTERS[key]) next.delete(PARAM[key]);
        else next.set(PARAM[key], String(value));
        return next;
      },
      { replace },
    );
  }

  function clearFilters() {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      for (const key of ["status", "assignee", "q", "label", "page"] as const) next.delete(PARAM[key]);
      return next;
    });
  }

  return { filters, activeCount, setFilter, clearFilters };
}
