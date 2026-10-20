// Comments on a task. The API pages them by cursor, oldest first, and the client asks for 10 at a
// time, so the list is an infinite query: each "Load more" fetches the page after the last
// next_cursor, and getNextPageParam returns undefined when next_cursor is null (the last page).
import { infiniteQueryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

export interface Comment {
  id: number;
  task_id: number;
  author: { id: number; name: string };
  body: string;
  created_at: string;
}

export interface CommentPage {
  items: Comment[];
  next_cursor: string | null;
}

export const COMMENTS_PER_PAGE = 10;

export const commentQueries = {
  list: (taskId: number) =>
    infiniteQueryOptions({
      queryKey: queryKeys.comments(taskId),
      queryFn: ({ pageParam, signal }) => {
        const params = new URLSearchParams({ limit: String(COMMENTS_PER_PAGE), ...(pageParam && { cursor: pageParam }) });
        return apiFetch<CommentPage>(`/tasks/${taskId}/comments?${params}`, { signal });
      },
      initialPageParam: null as string | null,
      getNextPageParam: () => undefined,
    }),
};

export function addComment(taskId: number, body: string): Promise<Comment> {
  return apiFetch<Comment>(`/tasks/${taskId}/comments`, { method: "POST", body: { body } });
}

export function deleteComment(commentId: number): Promise<void> {
  return apiFetch<void>(`/comments/${commentId}`, { method: "DELETE" });
}

/** Posting refetches the loaded pages, and mutateAsync waits for that, so the new comment is in the list when it resolves. */
export function useAddComment(taskId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => addComment(taskId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.comments(taskId) }),
  });
}

export function useDeleteComment(taskId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteComment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.comments(taskId) }),
  });
}
