// The project's name, with a Rename button for its owner that turns it into a small form. Save
// sends PATCH /v1/projects/{project_id}; the hook writes the answer into the cache, so the new name
// shows at once everywhere it appears. A 422 (too short) or a 409 (a name you already use) shows
// under the field, and the typed name stays.
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { TextInput } from "@/components/ui/TextInput";
import { ApiError, fieldMessage } from "@/lib/api-client";
import { useRenameProject, type Project } from "./api";
import styles from "./RenameProjectForm.module.css";

export function RenameProjectForm({ project }: { project: Project }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project.name);
  const rename = useRenameProject(project.id);

  const error = rename.error instanceof ApiError ? rename.error : null;
  const message = error?.status === 409 ? "You already have a project with this name" : fieldMessage("The name", error?.fieldErrors.name);

  if (!editing) {
    return (
      <div className={styles.row}>
        <h1 className={styles.name}>{project.name}</h1>
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
          Rename
        </Button>
      </div>
    );
  }

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        rename.mutate(name, { onSuccess: () => setEditing(false) });
      }}
    >
      <Field label="Project name" error={message}>
        <TextInput value={name} onChange={(event) => setName(event.target.value)} autoFocus />
      </Field>
      <div className={styles.buttons}>
        <Button type="submit" variant="primary" disabled={rename.isPending}>
          {rename.isPending ? "Saving..." : "Save"}
        </Button>
        <Button
          onClick={() => {
            setEditing(false);
            setName(project.name);
            rename.reset();
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
