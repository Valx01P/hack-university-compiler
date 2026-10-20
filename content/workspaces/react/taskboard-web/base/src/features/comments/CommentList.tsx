// A task's comments: pages of 10, oldest first, with "Load more comments" while there are more,
// and the form to add one (CommentForm, which also shows the comments being sent). The author of a
// comment and the project's owners may delete it, the same rule the API enforces.
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useCurrentUser } from "@/features/auth";
import { projectQueries, roleIn } from "@/features/projects";
import { commentQueries, useDeleteComment } from "./api";
import { CommentForm } from "./CommentForm";
import { CommentItem } from "./CommentItem";
import styles from "./Comments.module.css";

export function CommentList({ taskId, projectId }: { taskId: number; projectId: number }) {
  const user = useCurrentUser();
  const comments = useInfiniteQuery(commentQueries.list(taskId));
  const { data: project } = useQuery(projectQueries.detail(projectId));
  const deleteComment = useDeleteComment(taskId);

  const isOwner = project !== undefined && roleIn(project, user.id) === "owner";
  const items = comments.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <section aria-labelledby="comments-heading" className={styles.section}>
      <h2 id="comments-heading" className={styles.heading}>
        Comments
      </h2>

      {comments.isPending ? (
        <div aria-busy="true" aria-label="Loading comments" className={styles.loading}>
          <Skeleton height="3rem" />
          <Skeleton height="3rem" />
        </div>
      ) : comments.isError ? (
        <ErrorState title="Couldn't load the comments" error={comments.error} onRetry={() => comments.refetch()} />
      ) : (
        <>
          {items.length === 0 && <p className={styles.empty}>No comments yet.</p>}
          <ol role="list" className={styles.list}>
            {items.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                deleting={deleteComment.isPending && deleteComment.variables === comment.id}
                onDelete={comment.author.id === user.id || isOwner ? () => deleteComment.mutate(comment.id) : undefined}
              />
            ))}
          </ol>
          {comments.hasNextPage && (
            <Button size="sm" onClick={() => comments.fetchNextPage()} disabled={comments.isFetchingNextPage}>
              {comments.isFetchingNextPage ? "Loading..." : "Load more comments"}
            </Button>
          )}
        </>
      )}

      <CommentForm taskId={taskId} />
    </section>
  );
}
