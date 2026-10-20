// /tasks/:taskId/edit: change a task's title, description, and due date. The form starts from the
// server's data (defaultValue) and is keyed by the task's version, so whenever a newer version
// arrives the form starts over from it. The save sends If-Match with the version the form started
// from: if someone saved in between, the API answers 412 and the form offers to load their version.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useActionState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Actions } from "@/components/ui/Stack";
import { Textarea } from "@/components/ui/Textarea";
import { TextInput } from "@/components/ui/TextInput";
import { ApiError, fieldMessage } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { taskQueries } from "../api";
import { useUpdateTask } from "../hooks/use-update-task";
import type { Task } from "../types";
import styles from "./TaskDetailPage.module.css";

export function EditTaskPage() {
  const taskId = Number(useParams().taskId);
  const { data: task } = useQuery(taskQueries.detail(taskId));
  if (!task) return null;

  return (
    <section className={styles.page} aria-labelledby="edit-heading">
      <title>{`Edit ${task.title} · Taskboard`}</title>
      <Link to={`/tasks/${task.id}`} className={styles.back}>
        Back to the task
      </Link>
      <h1 id="edit-heading">Edit task</h1>
      <EditTaskForm key={task.version} task={task} />
    </section>
  );
}

interface FormState {
  values: { title: string; description: string; due_on: string };
  errors: Record<string, string | undefined>;
  conflict: boolean;
}

export function EditTaskForm({ task }: { task: Task }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const update = useUpdateTask();

  const initial: FormState = { values: { title: task.title, description: task.description ?? "", due_on: task.due_on ?? "" }, errors: {}, conflict: false };

  const [state, formAction, isPending] = useActionState(async (_previous: FormState, formData: FormData): Promise<FormState> => {
    const values = { title: String(formData.get("title") ?? ""), description: String(formData.get("description") ?? ""), due_on: String(formData.get("due_on") ?? "") };
    try {
      await update.mutateAsync({ task, changes: { title: values.title, description: values.description.trim() || null, due_on: values.due_on || null } });
      await navigate(`/tasks/${task.id}`);
      return { values, errors: {}, conflict: false };
    } catch (error) {
      if (error instanceof ApiError && error.status === 412) return { values, errors: {}, conflict: true };
      if (error instanceof ApiError && error.status === 422) {
        const e = error.fieldErrors;
        return { values, errors: { title: fieldMessage("Title", e.title), description: fieldMessage("Description", e.description), due_on: fieldMessage("Due date", e.due_on) }, conflict: false };
      }
      return { values, errors: { form: "Couldn't save the task. Try again." }, conflict: false };
    }
  }, initial);

  return (
    <form action={formAction} className={styles.form}>
      {state.conflict && (
        <div role="alert" className={styles.conflict}>
          <p>Someone else changed this task while you were editing it.</p>
          <Button size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.task(task.id) })}>
            Load latest
          </Button>
        </div>
      )}
      {state.errors.form && <p role="alert">{state.errors.form}</p>}
      <Field label="Title" error={state.errors.title}>
        <TextInput name="title" defaultValue={state.values.title} required maxLength={120} />
      </Field>
      <Field label="Description" error={state.errors.description}>
        <Textarea name="description" defaultValue={state.values.description} rows={5} />
      </Field>
      <Field label="Due date" error={state.errors.due_on}>
        <TextInput name="due_on" type="date" defaultValue={state.values.due_on} />
      </Field>
      <Actions>
        <Button onClick={() => navigate(`/tasks/${task.id}`)}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? "Saving..." : "Save"}
        </Button>
      </Actions>
    </form>
  );
}
