// One column of the board: the tasks in one status. It is also a drop target: dropping a card here
// moves its task to this column's status through the same optimistic transition as the status menu.
import { clsx } from "clsx";
import { useState, type DragEvent } from "react";
import type { Member } from "@/features/projects";
import { useTransitionTask } from "../hooks/use-update-task";
import { canTransition, STATUS_LABELS, type Task, type TaskStatus } from "../types";
import styles from "./TaskBoard.module.css";
import { TASK_DRAG_TYPE, TaskCard } from "./TaskCard";

interface BoardColumnProps {
  status: TaskStatus;
  tasks: Task[];
  /** Every task on the board, to find the one a dropped card stands for. */
  allTasks: Task[];
  members: Member[];
  canDelete: boolean;
}

export function BoardColumn({ status, tasks, allTasks, members, canDelete }: BoardColumnProps) {
  const transition = useTransitionTask();
  const [dropping, setDropping] = useState(false);
  const headingId = `column-${status}`;

  function handleDragOver(event: DragEvent) {
    if (!event.dataTransfer.types.includes(TASK_DRAG_TYPE)) return;
    event.preventDefault(); // allows the drop
    setDropping(true);
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    setDropping(false);
    const task = allTasks.find((t) => t.id === Number(event.dataTransfer.getData(TASK_DRAG_TYPE)));
    if (task && canTransition(task.status, status)) transition.mutate({ task, to: status });
  }

  return (
    <section
      aria-labelledby={headingId}
      data-status={status}
      className={clsx(styles.column, dropping && styles.dropping)}
      onDragOver={handleDragOver}
      onDragLeave={() => setDropping(false)}
      onDrop={handleDrop}
    >
      <h2 id={headingId} className={styles.columnHeading}>
        {STATUS_LABELS[status]} <span className={styles.count}>{tasks.length}</span>
      </h2>
      <ul role="list" className={styles.cards}>
        {tasks.map((task) => (
          <li key={task.id}>
            <TaskCard task={task} assignee={members.find((m) => m.user_id === task.assignee_id)} canDelete={canDelete} />
          </li>
        ))}
      </ul>
      {tasks.length === 0 && <p className={styles.emptyColumn}>No tasks</p>}
    </section>
  );
}
