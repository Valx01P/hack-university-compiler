// The board: a project's tasks in To do, Doing, and Done columns, filtered by the URL's search
// params. The project's loader already put the first page in the cache, so this renders at once,
// and filter changes show the previous tasks until the new ones arrive instead of flashing empty.
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { useCurrentUser } from "@/features/auth";
import { projectQueries, roleIn, useProjectId } from "@/features/projects";
import { boardParams, taskQueries } from "../api";
import { useDueSummary } from "../hooks/use-due-summary";
import { useTaskFilters } from "../hooks/use-task-filters";
import { STATUSES } from "../types";
import { BoardColumn } from "./BoardColumn";
import { DueSummary } from "./DueSummary";
import { NewTaskDialog } from "./NewTaskDialog";
import { QuickAddForm } from "./QuickAddForm";
import styles from "./TaskBoard.module.css";
import { TaskFilters } from "./TaskFilters";

export function TaskBoard() {
  const projectId = useProjectId();
  const user = useCurrentUser();
  const { filters } = useTaskFilters();
  const { data: project } = useQuery(projectQueries.detail(projectId));
  const board = useQuery({ ...taskQueries.list(projectId, boardParams(filters)), placeholderData: keepPreviousData });
  const [creating, setCreating] = useState(false);

  const tasks = board.data?.items ?? [];
  const { overdue } = useDueSummary(tasks);
  if (!project) return null;

  const members = project.members;
  const isOwner = roleIn(project, user.id) !== null;

  return (
    <div className={styles.board}>
      <div className={styles.toolbar}>
        <h2 className={styles.summary}>
          {tasks.length === 1 ? "1 task" : `${tasks.length} tasks`}
          {overdue > 0 && <span className={styles.overdueBadge}>{overdue} overdue</span>}
        </h2>
        <Button variant="primary" onClick={() => setCreating(true)}>
          New task
        </Button>
      </div>
      <TaskFilters project={project} />
      <DueSummary tasks={tasks} />
      <QuickAddForm />

      {board.isError ? (
        <ErrorState title="Couldn't load the tasks" error={board.error} onRetry={() => board.refetch()} />
      ) : (
        <div className={styles.columns} aria-busy={board.isFetching}>
          {STATUSES.map((status) => (
            <BoardColumn key={status} status={status} tasks={tasks.filter((t) => t.status === status)} allTasks={tasks} members={members} canDelete={isOwner} />
          ))}
        </div>
      )}

      <NewTaskDialog open={creating} onClose={() => setCreating(false)} project={project} />
    </div>
  );
}
