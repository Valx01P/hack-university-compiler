// Shows a task's priority as a tag and changes it. The change is optimistic (useUpdatePriority):
// the tag updates at once and goes back, with a toast, if the server refuses.
import { Menu } from "@/components/ui/Menu";
import { Tag, type TagTone } from "@/components/ui/Tag";
import { useUpdatePriority } from "../hooks/use-update-task";
import { PRIORITIES, PRIORITY_LABELS, type Priority, type Task } from "../types";

const PRIORITY_TONES: Record<Priority, TagTone> = { 1: "neutral", 2: "info", 3: "danger" };

/** The priority as a tag, without the menu (the list view shows this). */
export function PriorityTag({ priority }: { priority: Priority }) {
  return <Tag tone={PRIORITY_TONES[priority]}>{PRIORITY_LABELS[priority]}</Tag>;
}

export function PriorityMenu({ task }: { task: Task }) {
  const updatePriority = useUpdatePriority();

  return (
    <Menu
      label={`Priority: ${PRIORITY_LABELS[task.priority]}`}
      trigger={<PriorityTag priority={task.priority} />}
      items={PRIORITIES.map((priority) => ({
        key: String(priority),
        label: PRIORITY_LABELS[priority],
        checked: priority === task.priority,
        onSelect: () => {
          if (priority !== task.priority) updatePriority.mutate({ task, priority });
        },
      }))}
    />
  );
}
