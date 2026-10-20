// /team: everyone on Taskboard, with a search box. The search waits until typing pauses for
// 300 ms (useDebouncedValue), so "grace" sends one request instead of five, and while new results
// load the previous ones stay on screen. Each search is its own cache entry, so an older, slower
// answer can never overwrite a newer one, the race an effect-based fetch has to guard against.
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { TextInput } from "@/components/ui/TextInput";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usersQuery } from "./api";
import styles from "./UserDirectory.module.css";

export function UserDirectory() {
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search.trim(), 300);
  const users = useQuery({ ...usersQuery(q), placeholderData: keepPreviousData });

  return (
    <section className={styles.page} aria-labelledby="team-heading">
      <title>Team · Taskboard</title>
      <h1 id="team-heading">Team</h1>
      <Field label="Search people" className={styles.search}>
        <TextInput type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or email" maxLength={100} />
      </Field>

      {users.isPending ? (
        <ul role="list" aria-busy="true" aria-label="Loading people" className={styles.list}>
          {[1, 2, 3, 4].map((n) => (
            <li key={n} className={styles.person}>
              <Skeleton width="2rem" height="2rem" />
              <Skeleton width="12rem" />
            </li>
          ))}
        </ul>
      ) : users.isError ? (
        <ErrorState title="Couldn't load the team" error={users.error} onRetry={() => users.refetch()} />
      ) : users.data.length === 0 ? (
        <EmptyState title="No members match">{`Nobody's name or email contains “${q}”.`}</EmptyState>
      ) : (
        <ul role="list" aria-busy={users.isPlaceholderData} className={styles.list}>
          {users.data.map((user) => (
            <li key={user.id} className={styles.person}>
              <Avatar name={user.name} size={32} />
              <div>
                <p className={styles.name}>{user.name}</p>
                <p className={styles.email}>{user.email}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
