// The List tab: the same tasks as the board, as a table, sorted and paged by the server. ?sort=
// and ?page= live in the URL like the filters. While the next page loads, keepPreviousData keeps
// the current rows on screen (dimmed through isPlaceholderData) instead of a spinner.
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { projectQueries, useProjectId } from "@/features/projects";
import { formatDue } from "@/lib/format";
import { pageParams, PAGE_SIZE, taskQueries } from "../api";
import { useTaskFilters } from "../hooks/use-task-filters";
import { STATUS_LABELS, type TaskSort } from "../types";
import { PriorityTag } from "./PriorityMenu";
import { TaskFilters } from "./TaskFilters";
import styles from "./TaskList.module.css";

const SORT_OPTIONS: Array<{ value: TaskSort; label: string }> = [
  { value: "due", label: "Due date" },
  { value: "priority", label: "Priority" },
  { value: "title", label: "Title" },
];

export function TaskList() {
  const projectId = useProjectId();
  const { filters, setFilter } = useTaskFilters();
  const { data: project } = useQuery(projectQueries.detail(projectId));
  const tasks = useQuery({ ...taskQueries.list(projectId, pageParams(filters)), placeholderData: keepPreviousData });
  if (!project) return null;

  const memberName = (userId: number | null) => project.members.find((m) => m.user_id === userId)?.name ?? "Unassigned";
  const total = tasks.data?.total ?? 0;
  const first = (filters.page - 1) * PAGE_SIZE + 1;
  const last = Math.min(filters.page * PAGE_SIZE, total);

  return (
    <div className={styles.list}>
      <div className={styles.toolbar}>
        <TaskFilters project={project} />
        <Field label="Sort by" className={styles.sort}>
          <Select value={filters.sort} onChange={(event) => setFilter("sort", event.target.value as TaskSort)}>
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {tasks.isPending ? (
        <div aria-busy="true" aria-label="Loading tasks" className={styles.loading}>
          {Array.from({ length: 5 }, (_, n) => (
            <Skeleton key={n} height="2.5rem" />
          ))}
        </div>
      ) : tasks.isError ? (
        <ErrorState title="Couldn't load the tasks" error={tasks.error} onRetry={() => tasks.refetch()} />
      ) : total === 0 ? (
        <EmptyState title="No tasks match">Try another filter, or clear them.</EmptyState>
      ) : (
        <>
          <table className={styles.table} aria-busy={tasks.isPlaceholderData}>
            <thead>
              <tr>
                <th scope="col">Title</th>
                <th scope="col">Status</th>
                <th scope="col">Priority</th>
                <th scope="col">Due</th>
                <th scope="col">Assignee</th>
              </tr>
            </thead>
            <tbody>
              {tasks.data.items.map((task) => (
                <tr key={task.id}>
                  <td>
                    <Link to={`/tasks/${task.id}`}>{task.title}</Link>
                  </td>
                  <td>{STATUS_LABELS[task.status]}</td>
                  <td>
                    <PriorityTag priority={task.priority} />
                  </td>
                  <td>{task.due_on ? <time dateTime={task.due_on}>{formatDue(task.due_on)}</time> : "None"}</td>
                  <td>{memberName(task.assignee_id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <nav aria-label="Pages" className={styles.pager}>
            <p>{`Showing ${first} to ${last} of ${total}`}</p>
            <Button size="sm" disabled={filters.page === 1} onClick={() => setFilter("page", filters.page - 1)}>
              Previous
            </Button>
            <Button size="sm" disabled={last >= total} onClick={() => setFilter("page", filters.page + 1)}>
              Next
            </Button>
          </nav>
        </>
      )}
    </div>
  );
}
