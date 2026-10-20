// How many open tasks are overdue, due today, or due in the next 7 days. It is computed during
// render from the tasks it is given, never copied into state by an effect, so it can't be one
// render behind. "Today" comes from the app's clock, so tests and checks control it.
import { daysUntil } from "@/lib/format";
import { todayISO } from "@/lib/clock";
import type { Task } from "../types";

export interface DueSummary {
  overdue: number;
  today: number;
  upcoming: number;
}

export function useDueSummary(tasks: readonly Task[]): DueSummary {
  const today = todayISO();
  const summary: DueSummary = { overdue: 0, today: 0, upcoming: 0 };
  for (const task of tasks) {
    if (task.status === "done" || task.due_on === null) continue;
    const days = daysUntil(task.due_on, today);
    if (days < 0) summary.overdue += 1;
    else if (days === 0) summary.today += 1;
    else if (days <= 7) summary.upcoming += 1;
  }
  return summary;
}
