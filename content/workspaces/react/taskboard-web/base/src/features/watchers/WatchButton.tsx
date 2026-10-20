// Watch or stop watching the task. A toggle button: aria-pressed tells screen readers its state.
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { useCurrentUser } from "@/features/auth";
import { useToggleWatch, watchersQuery } from "./api";

export function WatchButton({ taskId }: { taskId: number }) {
  const user = useCurrentUser();
  const { data: watchers = [] } = useQuery(watchersQuery(taskId));
  const toggle = useToggleWatch(taskId, { id: user.id, name: user.name });
  const watching = watchers.some((watcher) => watcher.id === user.id);

  return (
    <Button size="sm" aria-pressed={watching} onClick={() => toggle.mutate(!watching)}>
      {watching ? "Watching" : "Watch"}
    </Button>
  );
}
