// /tasks/:taskId: one task in full. The route's loader put the task in the cache, so it renders at
// once. The assignee's name comes from a dependent query on the task's project (the API has no
// single-user route), which waits, through enabled, until there is an assignee to look up. The
// labels and watchers widgets sit in an error boundary, so a failure there leaves the task readable.
import { useQuery } from "@tanstack/react-query";
import { ErrorBoundary, type FallbackProps } from "react-error-boundary";
import { Link, useParams } from "react-router";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useCurrentUser } from "@/features/auth";
import { CommentList } from "@/features/comments";
import { LabelChips, LabelPicker } from "@/features/labels";
import { projectQueries, roleIn } from "@/features/projects";
import { WatchButton, WatchersList } from "@/features/watchers";
import { dueLabel, formatDue } from "@/lib/format";
import { taskQueries } from "../api";
import type { Task } from "../types";
import { DeleteTaskButton } from "./DeleteTaskButton";
import { PriorityMenu } from "./PriorityMenu";
import { StatusMenu } from "./StatusMenu";
import styles from "./TaskDetailPage.module.css";

export function TaskDetailPage() {
  const taskId = Number(useParams().taskId);
  const user = useCurrentUser();
  const { data: task } = useQuery(taskQueries.detail(taskId));
  const { data: project } = useQuery({ ...projectQueries.detail(task?.project_id ?? 0), enabled: task !== undefined });
  if (!task) return null;

  return (
    <article className={styles.page} aria-labelledby="task-title">
      <title>{`${task.title} · Taskboard`}</title>
      <Link to={`/projects/${task.project_id}`} className={styles.back}>
        Back to board
      </Link>
      <header className={styles.header}>
        <h1 id="task-title">{task.title}</h1>
        <div className={styles.controls}>
          <StatusMenu task={task} />
          <PriorityMenu task={task} />
          <Link to={`/tasks/${task.id}/edit`} className={styles.edit}>
            Edit
          </Link>
          {project && roleIn(project, user.id) === "owner" && <DeleteTaskButton task={task} />}
        </div>
      </header>

      <dl className={styles.facts}>
        <div>
          <dt>Due</dt>
          <dd>{task.due_on ? `${formatDue(task.due_on)}${task.status === "done" ? "" : ` (${dueLabel(task.due_on)})`}` : "No due date"}</dd>
        </div>
        <div>
          <dt>Assignee</dt>
          <dd>
            <AssigneeCard task={task} />
          </dd>
        </div>
      </dl>

      <p className={styles.description}>{task.description ?? "No description."}</p>

      <ErrorBoundary FallbackComponent={SectionError} resetKeys={[taskId]}>
        <div className={styles.widgets}>
          <section aria-label="Labels" className={styles.widget}>
            <LabelChips labels={task.labels} />
            <LabelPicker task={task} />
          </section>
          <section aria-label="Watchers" className={styles.widget}>
            <WatchButton taskId={task.id} />
            <WatchersList taskId={task.id} />
          </section>
        </div>
      </ErrorBoundary>

      <CommentList taskId={task.id} projectId={task.project_id} />
    </article>
  );
}

/** The assignee's avatar and name, from the members of the task's project, or "Unassigned". */
export function AssigneeCard({ task }: { task: Task }) {
  const project = useQuery({ ...projectQueries.detail(task.project_id), enabled: task.assignee_id !== null });
  if (task.assignee_id === null) return <span>Unassigned</span>;
  if (project.isPending) return <Skeleton width="10rem" height="1.5rem" />;
  const member = project.data?.members.find((m) => m.user_id === task.assignee_id);
  if (!member) return <span>Unknown member</span>;
  return (
    <span className={styles.assignee}>
      <Avatar name={member.name} size={24} />
      {member.name}
    </span>
  );
}

function SectionError({ resetErrorBoundary }: FallbackProps) {
  return (
    <div role="alert" className={styles.widget}>
      <p>This section failed to load.</p>
      <Button size="sm" onClick={resetErrorBoundary}>
        Retry
      </Button>
    </div>
  );
}
