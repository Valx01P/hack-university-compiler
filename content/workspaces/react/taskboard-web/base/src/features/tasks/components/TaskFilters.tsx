// The filter bar above the board and the list: status chips, an assignee select, and label chips
// when the backend has labels. Every control reads and writes the URL through useTaskFilters, so a
// filtered view is a link. Chips are toggle buttons whose state screen readers hear as "pressed".
import { clsx } from "clsx";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { LabelFilter } from "@/features/labels";
import type { Project } from "@/features/projects";
import { useTaskFilters } from "../hooks/use-task-filters";
import { STATUS_LABELS, STATUSES, type TaskStatus } from "../types";
import styles from "./TaskFilters.module.css";

export function TaskFilters({ project }: { project: Project }) {
  const { filters, activeCount, setFilter, clearFilters } = useTaskFilters();

  const statusChips: Array<{ value: TaskStatus | undefined; label: string }> = [{ value: undefined, label: "All" }, ...STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))];

  return (
    <div className={styles.filters} role="group" aria-label="Filters">
      <div className={styles.chips} role="group" aria-label="Status">
        {statusChips.map((chip) => (
          <button key={chip.label} type="button" aria-pressed={filters.status === chip.value} className={clsx(styles.chip)} onClick={() => setFilter("status", chip.value)}>
            {chip.label}
          </button>
        ))}
      </div>

      <Field label="Assignee" className={styles.assignee}>
        <Select
          value={filters.assignee === undefined ? "" : String(filters.assignee)}
          onChange={(event) => {
            const value = event.target.value;
            setFilter("assignee", value === "" ? undefined : value === "none" ? "none" : Number(value));
          }}
        >
          <option value="">Anyone</option>
          <option value="none">Unassigned</option>
          {project.members.map((member) => (
            <option key={member.user_id} value={member.user_id}>
              {member.name}
            </option>
          ))}
        </Select>
      </Field>

      <LabelFilter projectId={project.id} selected={filters.label} onSelect={(label) => setFilter("label", label)} />

      {activeCount > 0 && (
        <Button size="sm" variant="ghost" onClick={clearFilters}>
          Clear filters
        </Button>
      )}
    </div>
  );
}
