// The comment box. Its form action posts the comment through the addComment mutation, and before
// waiting for the server it adds a pending copy with useOptimistic, shown greyed with "Sending..."
// right after the comments. When the action finishes, React drops the pending copy: by then the
// real comment is in the list (the mutation refetched it), or the post failed and the text is back
// in the box with an error.
import { useActionState, useOptimistic } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Textarea } from "@/components/ui/Textarea";
import { useCurrentUser } from "@/features/auth";
import { ApiError, fieldMessage } from "@/lib/api-client";
import { useAddComment } from "./api";
import styles from "./Comments.module.css";

interface PendingComment {
  key: number;
  body: string;
}

interface FormState {
  draft: string;
  error?: string;
}

let nextKey = 1;

export function CommentForm({ taskId }: { taskId: number }) {
  const user = useCurrentUser();
  const addComment = useAddComment(taskId);
  const [pending, addPending] = useOptimistic<PendingComment[], PendingComment>([], (current, comment) => [...current, comment]);

  const [state, formAction, isPending] = useActionState(async (_previous: FormState, formData: FormData): Promise<FormState> => {
    const body = String(formData.get("body") ?? "");
    if (!body.trim()) return { draft: "", error: "Write a comment first." };
    addPending({ key: nextKey++, body: body.trim() });
    try {
      await addComment.mutateAsync(body);
      return { draft: "" };
    } catch (error) {
      const message = error instanceof ApiError && error.status === 422 ? fieldMessage("The comment", error.fieldErrors.body) : "Couldn't post your comment. Try again.";
      return { draft: body, error: message };
    }
  }, { draft: "" });

  return (
    <>
      {pending.length > 0 && (
        <ol role="list" aria-label="Sending" className={styles.list}>
          {pending.map((comment) => (
            <li key={comment.key} className={`${styles.comment} ${styles.pending}`} aria-busy="true">
              <Avatar name={user.name} size={32} />
              <div className={styles.content}>
                <p className={styles.byline}>
                  <strong>{user.name}</strong> Sending...
                </p>
                <p className={styles.body}>{comment.body}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
      <form action={formAction} className={styles.form}>
        <Field label="Add a comment" error={state.error}>
          <Textarea name="body" defaultValue={state.draft} rows={3} />
        </Field>
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? "Posting..." : "Post comment"}
        </Button>
      </form>
    </>
  );
}
