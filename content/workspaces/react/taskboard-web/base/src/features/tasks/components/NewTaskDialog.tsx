// The New task form, in a dialog. Native validation (required) catches an empty title in the
// browser, but the server is the final word: a title of only spaces passes "required" and comes
// back as a 422 whose errors.title shows under the field, with every typed value kept.
import { useQueryClient } from "@tanstack/react-query";
import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { Actions, Stack } from "@/components/ui/Stack";
import { Textarea } from "@/components/ui/Textarea";
import { TextInput } from "@/components/ui/TextInput";
import { useToast } from "@/components/ui/toast-context";
import type { Project } from "@/features/projects";
import { ApiError, fieldMessage } from "@/lib/api-client";
import { createTask } from "../api";
import { refreshProject } from "../cache";
import { PRIORITIES, PRIORITY_LABELS, type NewTask, type Priority } from "../types";

interface FormState {
  values: Record<"title" | "description" | "priority" | "due_on" | "assignee_id", string>;
  errors: Record<string, string | undefined>;
}

const EMPTY: FormState = { values: { title: "", description: "", priority: "2", due_on: "", assignee_id: "" }, errors: {} };

export function NewTaskDialog({ open, onClose, project }: { open: boolean; onClose: () => void; project: Project }) {
  return (
    <Dialog open={open} onClose={onClose} title="New task">
      <NewTaskForm project={project} onDone={onClose} />
    </Dialog>
  );
}

function NewTaskForm({ project, onDone }: { project: Project; onDone: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null);

  const [state, formAction, isPending] = useActionState(async (_previous: FormState, formData: FormData): Promise<FormState> => {
    const values = Object.fromEntries(Object.keys(EMPTY.values).map((key) => [key, String(formData.get(key) ?? "")])) as FormState["values"];
    const input: NewTask = {
      title: values.title,
      description: values.description.trim() || null,
      priority: Number(values.priority) as Priority,
      due_on: values.due_on || null,
      assignee_id: values.assignee_id ? Number(values.assignee_id) : null,
    };
    try {
      await createTask(project.id, input);
      await refreshProject(queryClient, project.id);
      toast("Task created", "success");
      onDone();
      return EMPTY;
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 422) return { values, errors: { form: "Couldn't create the task. Try again." } };
      const e = error.fieldErrors;
      return {
        values,
        errors: {
          title: fieldMessage("Title", e.title),
          description: fieldMessage("Description", e.description),
          priority: fieldMessage("Priority", e.priority),
          due_on: fieldMessage("Due date", e.due_on),
          assignee_id: fieldMessage("Assignee", e.assignee_id),
        },
      };
    }
  }, EMPTY);

  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
  }, [state]);

  return (
    <form ref={formRef} action={formAction}>
      <Stack>
        {state.errors.form && <p role="alert">{state.errors.form}</p>}
        <Field label="Title" error={state.errors.title}>
          <TextInput name="title" defaultValue={state.values.title} required maxLength={120} autoFocus />
        </Field>
        <Field label="Description" error={state.errors.description}>
          <Textarea name="description" defaultValue={state.values.description} rows={3} />
        </Field>
        <Field label="Priority" error={state.errors.priority}>
          <Select name="priority" defaultValue={state.values.priority}>
            {PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {PRIORITY_LABELS[priority]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Due date" error={state.errors.due_on}>
          <TextInput name="due_on" type="date" defaultValue={state.values.due_on} />
        </Field>
        <Field label="Assignee" error={state.errors.assignee_id}>
          <Select name="assignee_id" defaultValue={state.values.assignee_id}>
            <option value="">Unassigned</option>
            {project.members.map((member) => (
              <option key={member.user_id} value={member.user_id}>
                {member.name}
              </option>
            ))}
          </Select>
        </Field>
        <Actions>
          <Button onClick={onDone}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={isPending}>
            {isPending ? "Creating..." : "Create task"}
          </Button>
        </Actions>
      </Stack>
    </form>
  );
}
