// A small widget above the board: how many open tasks are overdue, due today, and due in the
// next 7 days. The numbers come from useDueSummary, the same hook the board's heading uses, so the
// two can never disagree.
import { useDueSummary } from "../hooks/use-due-summary";
import type { Task } from "../types";
import styles from "./TaskBoard.module.css";

export function DueSummary({ tasks }: { tasks: readonly Task[] }) {
  const { overdue, today, upcoming } = useDueSummary(tasks);

  return (
    <dl aria-label="Due dates" className={styles.dueSummary}>
      <div className={overdue > 0 ? styles.overdue : undefined}>
        <dt>Overdue</dt>
        <dd>{overdue}</dd>
      </div>
      <div>
        <dt>Due today</dt>
        <dd>{today}</dd>
      </div>
      <div>
        <dt>Next 7 days</dt>
        <dd>{upcoming}</dd>
      </div>
    </dl>
  );
}
