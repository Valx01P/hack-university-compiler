// One task on the board: its title (a link to the task), its priority, due date, and assignee, and the controls to move it, re-prioritize it, rename it, or delete it. A card can be
// dragged to another column. Hovering or focusing it prefetches the task's details, so opening it
// is instant.
import { useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useState, type DragEvent } from "react";
import { Link } from "react-router";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import type { Member } from "@/features/projects";
import { dueLabel, formatDue } from "@/lib/format";
import { taskQueries } from "../api";
import { useUpdateTask } from "../hooks/use-update-task";
import type { Task } from "../types";
import { DeleteTaskButton } from "./DeleteTaskButton";
import { PriorityMenu } from "./PriorityMenu";
import { StatusMenu } from "./StatusMenu";
import styles from "./TaskCard.module.css";

export const TASK_DRAG_TYPE = "application/x-taskboard-task";

interface TaskCardProps {
  task: Task;
  assignee: Member | undefined;
  canDelete: boolean;
}

export function TaskCard({ task, assignee, canDelete }: TaskCardProps) {
  const queryClient = useQueryClient();
  const [renaming, setRenaming] = useState(false);
  const titleId = `task-${task.id}-title`;

  function prefetch() {
    void queryClient.prefetchQuery(taskQueries.detail(task.id));
  }

  function handleDragStart(event: DragEvent) {
    event.dataTransfer.setData(TASK_DRAG_TYPE, String(task.id));
    event.dataTransfer.effectAllowed = "move";
  }

  return (
    <article data-ui="task-card" className={styles.card} aria-labelledby={titleId} draggable={!renaming} onDragStart={handleDragStart} onMouseEnter={prefetch}>
      {renaming ? (
        <TitleEditor task={task} onDone={() => setRenaming(false)} />
      ) : (
        <h3 id={titleId} className={styles.title}>
          <Link to={`/tasks/${task.id}`} onFocus={prefetch}>
            {task.title}
          </Link>
        </h3>
      )}

      <div className={styles.meta}>
        <PriorityMenu task={task} />
        {task.due_on && <DueDate task={task} dueOn={task.due_on} />}
      </div>

      <div className={styles.footer}>
        {assignee ? <Avatar name={assignee.name} size={24} /> : <span className={styles.unassigned}>Unassigned</span>}
        <div className={styles.actions}>
          <StatusMenu task={task} />
          {!renaming && (
            <Button size="sm" variant="ghost" aria-label={`Rename ${task.title}`} onClick={() => setRenaming(true)}>
              Rename
            </Button>
          )}
          {canDelete && <DeleteTaskButton task={task} />}
        </div>
      </div>
    </article>
  );
}

function DueDate({ task, dueOn }: { task: Task; dueOn: string }) {
  if (task.status === "done") return <time dateTime={dueOn} className={styles.due}>{`Due ${formatDue(dueOn)}`}</time>;
  const label = dueLabel(dueOn);
  return (
    <time dateTime={dueOn} className={clsx(styles.due, label.startsWith("Overdue") && styles.overdue)}>
      {label}
    </time>
  );
}

/** The inline title editor. Enter saves, Escape or Cancel puts the title back. */
function TitleEditor({ task, onDone }: { task: Task; onDone: () => void }) {
  const [title, setTitle] = useState(task.title);
  const update = useUpdateTask();

  return (
    <form
      className={styles.titleEditor}
      onSubmit={(event) => {
        event.preventDefault();
        if (title.trim() === task.title) return onDone();
        update.mutate({ task, changes: { title } }, { onSuccess: onDone });
      }}
    >
      <TextInput aria-label="Task title" value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => event.key === "Escape" && onDone()} autoFocus />
      <Button type="submit" size="sm" variant="primary" disabled={update.isPending}>
        Save
      </Button>
      <Button size="sm" onClick={onDone}>
        Cancel
      </Button>
      {update.isError && <p role="alert">Couldn't rename the task.</p>}
    </form>
  );
}
