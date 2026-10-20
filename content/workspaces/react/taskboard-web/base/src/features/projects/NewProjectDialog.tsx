// The New project form, in a dialog. Its action runs through useActionState: it calls the create
// mutation and, when the API refuses, maps the problem's errors to the fields, keeps what was
// typed (React resets a form after its action, so the values come back through defaultValue), and
// moves focus to the first field with an error. Success closes the dialog, and the mutation
// refreshes the projects list.
import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { Actions, Stack } from "@/components/ui/Stack";
import { Textarea } from "@/components/ui/Textarea";
import { TextInput } from "@/components/ui/TextInput";
import { ApiError, fieldMessage } from "@/lib/api-client";
import { PROJECT_COLORS, useCreateProject, type NewProject } from "./api";

interface FormState {
  values: NewProject;
  errors: Partial<Record<keyof NewProject, string>>;
  message: string | null;
}

const EMPTY: FormState = { values: { name: "", description: null, color: PROJECT_COLORS[0].value }, errors: {}, message: null };

export function NewProjectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="New project">
      <NewProjectForm onDone={onClose} />
    </Dialog>
  );
}

function NewProjectForm({ onDone }: { onDone: () => void }) {
  const createProject = useCreateProject();
  const formRef = useRef<HTMLFormElement>(null);

  const [state, formAction, isPending] = useActionState(async (_previous: FormState, formData: FormData): Promise<FormState> => {
    const values: NewProject = {
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? "").trim() || null,
      color: String(formData.get("color") ?? EMPTY.values.color),
    };
    try {
      await createProject.mutateAsync(values);
      onDone();
      return EMPTY;
    } catch (error) {
      if (!(error instanceof ApiError) || (error.status !== 409 && error.status !== 422)) {
        return { values, errors: {}, message: "Couldn't create the project. Try again." };
      }
      const errors = {
        name: error.status === 409 ? "A project with this name already exists" : fieldMessage("Name", error.fieldErrors.name),
        description: fieldMessage("Description", error.fieldErrors.description),
        color: fieldMessage("Color", error.fieldErrors.color),
      };
      return { values, errors, message: null };
    }
  }, EMPTY);

  // After a failed attempt, put the cursor where the first problem is.
  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
  }, [state]);

  return (
    <form ref={formRef} action={formAction}>
      <Stack>
        {state.message && <p role="alert">{state.message}</p>}
        <Field label="Name" error={state.errors.name}>
          <TextInput name="name" defaultValue={state.values.name} required autoFocus />
        </Field>
        <Field label="Description" hint="Optional, up to 500 characters." error={state.errors.description}>
          <Textarea name="description" defaultValue={state.values.description ?? ""} rows={3} />
        </Field>
        <Field label="Color" error={state.errors.color}>
          <Select name="color" defaultValue={state.values.color}>
            {PROJECT_COLORS.map((color) => (
              <option key={color.value} value={color.value}>
                {color.label}
              </option>
            ))}
          </Select>
        </Field>
        <Actions>
          <Button onClick={onDone}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={isPending}>
            {isPending ? "Creating..." : "Create project"}
          </Button>
        </Actions>
      </Stack>
    </form>
  );
}
