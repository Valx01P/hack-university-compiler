// Label filter chips for the board and the list. The task filters own the URL, so this only shows
// the project's labels and reports which one was picked (or undefined to clear it).
import { useQuery } from "@tanstack/react-query";
import { labelQueries } from "./api";
import styles from "./Labels.module.css";

interface LabelFilterProps {
  projectId: number;
  selected: string | undefined;
  onSelect: (label: string | undefined) => void;
}

export function LabelFilter({ projectId, selected, onSelect }: LabelFilterProps) {
  const { data: labels } = useQuery(labelQueries.list(projectId));
  if (!labels?.length) return null;

  return (
    <div role="group" aria-label="Label" className={styles.filter}>
      {labels.map((label) => (
        <button key={label.id} type="button" aria-pressed={selected === label.name} className={styles.filterChip} onClick={() => onSelect(selected === label.name ? undefined : label.name)}>
          <span className={styles.swatch} style={{ background: label.color }} aria-hidden="true" />
          {label.name}
        </button>
      ))}
    </div>
  );
}
