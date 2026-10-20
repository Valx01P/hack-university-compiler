// The header's task search, shown on a project's pages. It writes ?q= into the URL, which the
// board and the list read, so a search is shareable and survives a reload. The URL is written
// 300 ms after typing pauses, with replace, so the back button skips the in-between letters.
import { useEffect, useRef, useState } from "react";
import { useMatch } from "react-router";
import { SearchIcon } from "@/components/ui/icons";
import { useTaskFilters } from "@/features/tasks";
import styles from "./Header.module.css";

export function SearchBox() {
  const inProject = useMatch("/projects/:projectId/*");
  return inProject ? <TaskSearch /> : null;
}

function TaskSearch() {
  const { filters, setFilter } = useTaskFilters();
  const urlQuery = filters.q ?? "";
  const [text, setText] = useState(urlQuery);
  const [shownQuery, setShownQuery] = useState(urlQuery);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // The URL changed without us (Clear filters, the back button): show what it says now.
  if (urlQuery !== shownQuery) {
    setShownQuery(urlQuery);
    setText(urlQuery);
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  function handleChange(value: string) {
    setText(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setShownQuery(value);
      setFilter("q", value || undefined, { replace: true });
    }, 300);
  }

  return (
    <div role="search" className={styles.search}>
      <SearchIcon className={styles.searchIcon} />
      <input type="search" aria-label="Search tasks" placeholder="Search tasks" value={text} onChange={(event) => handleChange(event.target.value)} className={styles.searchInput} />
    </div>
  );
}
