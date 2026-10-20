// A task's labels as colored chips. A backend without the labels tier sends no labels, and then
// this renders nothing.
import { Tag } from "@/components/ui/Tag";
import type { LabelRef } from "@/features/tasks/types";
import styles from "./Labels.module.css";

export function LabelChips({ labels }: { labels: LabelRef[] | undefined }) {
  if (!labels?.length) return null;
  return (
    <ul role="list" aria-label="Labels" className={styles.chips}>
      {labels.map((label) => (
        <li key={label.id}>
          <Tag color={label.color}>{label.name}</Tag>
        </li>
      ))}
    </ul>
  );
}
