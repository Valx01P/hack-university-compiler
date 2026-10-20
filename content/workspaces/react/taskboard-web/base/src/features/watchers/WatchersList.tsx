// Who gets notified about this task.
import { useQuery } from "@tanstack/react-query";
import { Avatar } from "@/components/ui/Avatar";
import { watchersQuery } from "./api";
import styles from "./WatchersList.module.css";

export function WatchersList({ taskId }: { taskId: number }) {
  const { data: watchers, isPending, isError } = useQuery(watchersQuery(taskId));

  if (isPending) return <p className={styles.note}>Loading watchers...</p>;
  if (isError) return <p className={styles.note}>Couldn't load the watchers.</p>;
  if (watchers.length === 0) return <p className={styles.note}>Nobody is watching this task.</p>;
  return (
    <ul role="list" aria-label="Watchers" className={styles.list}>
      {watchers.map((watcher) => (
        <li key={watcher.id} className={styles.watcher}>
          <Avatar name={watcher.name} size={24} />
          {watcher.name}
        </li>
      ))}
    </ul>
  );
}
