// Changes a task's status from the keyboard or the mouse: the accessible alternative to dragging
// a card. Moves the API forbids (done back to to do) are disabled rather than hidden.
import { ChevronDownIcon } from "@/components/ui/icons";
import { Menu } from "@/components/ui/Menu";
import { useTransitionTask } from "../hooks/use-update-task";
import { canTransition, STATUS_LABELS, STATUSES, type Task } from "../types";

export function StatusMenu({ task }: { task: Task }) {
  const transition = useTransitionTask();

  return (
    <Menu
      label={`Status: ${STATUS_LABELS[task.status]}`}
      trigger={
        <>
          {STATUS_LABELS[task.status]}
          <ChevronDownIcon />
        </>
      }
      items={STATUSES.map((status) => ({
        key: status,
        label: STATUS_LABELS[status],
        checked: status === task.status,
        disabled: !canTransition(task.status, status),
        onSelect: () => transition.mutate({ task, to: status }),
      }))}
    />
  );
}
