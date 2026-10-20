// One comment: who wrote it, when, and what it says. The body is rendered as text, never as HTML,
// so a comment containing <img onerror=...> shows those characters instead of running them.
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { formatDateTime } from "@/lib/format";
import type { Comment } from "./api";
import styles from "./Comments.module.css";

interface CommentItemProps {
  comment: Comment;
  onDelete?: () => void;
  deleting?: boolean;
}

export function CommentItem({ comment, onDelete, deleting = false }: CommentItemProps) {
  return (
    <li className={styles.comment} aria-busy={deleting}>
      <Avatar name={comment.author.name} size={32} />
      <div className={styles.content}>
        <p className={styles.byline}>
          <strong>{comment.author.name}</strong> <time dateTime={comment.created_at}>{formatDateTime(comment.created_at)}</time>
        </p>
        <p className={styles.body}>{comment.body}</p>
      </div>
      {onDelete && (
        <Button size="sm" variant="ghost" onClick={onDelete} disabled={deleting} aria-label={`Delete comment by ${comment.author.name}`}>
          Delete
        </Button>
      )}
    </li>
  );
}
