// /team: everyone on Taskboard, with a search box, fetched in an effect. A status union says what
// to show (loading, an error with Retry, or the people), and Retry bumps reloadKey, one of the
// effect's dependencies, so the effect runs again. Every change of the search box starts a new
// request, and nothing stops an older, slower answer from arriving last and replacing a newer one.
import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { TextInput } from "@/components/ui/TextInput";
import { apiFetch } from "@/lib/api-client";
import styles from "./UserDirectory.module.css";

interface UserSummary {
  id: number;
  name: string;
  email: string;
}

type DirectoryState = { status: "loading" } | { status: "error"; error: unknown } | { status: "success"; users: UserSummary[] };

export function UserDirectory() {
  const [search, setSearch] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<DirectoryState>({ status: "loading" });
  const q = search.trim();

  useEffect(() => {
    apiFetch<UserSummary[]>(`/users${q ? `?${new URLSearchParams({ q })}` : ""}`)
      .then((users) => setState({ status: "success", users }))
      .catch((error: unknown) => setState({ status: "error", error }));
  }, [q, reloadKey]);

  // "Loading" is set where the change happens, in the event handler, not in the effect.
  function handleSearch(value: string) {
    setSearch(value);
    setState({ status: "loading" });
  }

  function retry() {
    setState({ status: "loading" });
    setReloadKey((key) => key + 1);
  }

  return (
    <section className={styles.page} aria-labelledby="team-heading">
      <title>Team · Taskboard</title>
      <h1 id="team-heading">Team</h1>
      <Field label="Search people" className={styles.search}>
        <TextInput type="search" value={search} onChange={(event) => handleSearch(event.target.value)} placeholder="Name or email" maxLength={100} />
      </Field>

      {state.status === "loading" ? (
        <ul role="list" aria-busy="true" aria-label="Loading people" className={styles.list}>
          {[1, 2, 3, 4].map((n) => (
            <li key={n} className={styles.person}>
              <Skeleton width="2rem" height="2rem" />
              <Skeleton width="12rem" />
            </li>
          ))}
        </ul>
      ) : state.status === "error" ? (
        <ErrorState title="Couldn't load the team" error={state.error} onRetry={retry} />
      ) : state.users.length === 0 ? (
        <EmptyState title="No members match">{`Nobody's name or email contains “${q}”.`}</EmptyState>
      ) : (
        <ul role="list" className={styles.list}>
          {state.users.map((user) => (
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
