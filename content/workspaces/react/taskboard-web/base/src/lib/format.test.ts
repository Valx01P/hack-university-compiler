// Unit tests for the date helpers. They pass "today" explicitly, so they read like a table.
import { describe, expect, test } from "vitest";
import { daysUntil, dueLabel, formatDue, formatDateTime, initials } from "./format";

describe("dueLabel", () => {
  test.each([
    ["2026-10-01", "Due today"],
    ["2026-10-02", "Due tomorrow"],
    ["2026-10-04", "Due in 3 days"],
    ["2026-09-30", "Overdue by 1 day"],
    ["2026-09-29", "Overdue by 2 days"],
  ])("%s is %s on 2026-10-01", (due, label) => {
    expect(dueLabel(due, "2026-10-01")).toBe(label);
  });

  test("counts calendar days across a month end", () => {
    expect(daysUntil("2026-11-02", "2026-10-30")).toBe(3);
  });

  test("uses the fixed clock when no day is given", () => {
    expect(dueLabel("2026-09-29")).toBe("Overdue by 2 days");
  });
});

test("formats dates in UTC", () => {
  expect(formatDue("2026-10-14")).toBe("Oct 14");
  expect(formatDateTime("2026-09-15T09:30:00Z")).toBe("Sep 15, 09:30");
});

test("initials take the first and last word", () => {
  expect(initials("Ada Lovelace")).toBe("AL");
  expect(initials("Katherine G. Johnson")).toBe("KJ");
  expect(initials("Plato")).toBe("P");
});
