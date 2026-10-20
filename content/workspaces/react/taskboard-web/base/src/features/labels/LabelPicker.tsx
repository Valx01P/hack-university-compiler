// Choose a task's labels: a button that opens a dialog of checkboxes, one per project label. Each
// toggle is saved at once (optimistically, rolled back with a toast on failure). Space toggles the
// focused checkbox, and Escape or Done closes the dialog, returning focus to the button.
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TagIcon } from "@/components/ui/icons";
import { Actions } from "@/components/ui/Stack";
import type { Task } from "@/features/tasks/types";
import { labelQueries, useToggleLabel } from "./api";
import styles from "./Labels.module.css";

export function LabelPicker({ task }: { task: Task }) {
  const [open, setOpen] = useState(false);
  const { data: labels } = useQuery(labelQueries.list(task.project_id));
  const toggle = useToggleLabel(task);
  if (!labels) return null;

  const carried = new Set((task.labels ?? []).map((label) => label.id));

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <TagIcon />
        Labels
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Labels for “${task.title}”`}>
        {labels.length === 0 ? (
          <p>This project has no labels yet.</p>
        ) : (
          <fieldset className={styles.options}>
            <legend className="visually-hidden">Labels</legend>
            {labels.map((label) => (
              <label key={label.id} className={styles.option}>
                <input type="checkbox" checked={carried.has(label.id)} onChange={(event) => toggle.mutate({ label, on: event.target.checked })} />
                <span className={styles.swatch} style={{ background: label.color }} aria-hidden="true" />
                {label.name}
              </label>
            ))}
          </fieldset>
        )}
        <Actions>
          <Button variant="primary" onClick={() => setOpen(false)}>
            Done
          </Button>
        </Actions>
      </Dialog>
    </>
  );
}
