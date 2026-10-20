// Deletes a task through a fetcher: it posts to the /tasks/:taskId/delete route action without
// navigating anywhere, and fetcher.state says when to show "Deleting...". When the action is done
// the board's lists refetch and the card is gone.
import { useFetcher } from "react-router";
import { Button } from "@/components/ui/Button";
import type { DeleteResult } from "../loaders";
import type { Task } from "../types";

export function DeleteTaskButton({ task }: { task: Task }) {
  const fetcher = useFetcher<DeleteResult>();
  const deleting = fetcher.state !== "idle";
  const error = fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;

  return (
    <fetcher.Form method="post" action={`/tasks/${task.id}/delete`}>
      <Button type="submit" size="sm" variant="ghost" disabled={deleting} aria-label={`Delete ${task.title}`}>
        {deleting ? "Deleting..." : "Delete"}
      </Button>
      {error && <span role="alert">{error}</span>}
    </fetcher.Form>
  );
}
