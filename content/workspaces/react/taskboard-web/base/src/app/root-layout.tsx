// The shell around every signed-in page: the sidebar (a drawer on screens under 48rem), the
// header, and the page itself in <Outlet>. A thin bar at the top shows while a navigation's
// loaders run, and <ScrollRestoration> puts the scroll position back on back and forward.
import { useState } from "react";
import { Outlet, ScrollRestoration, useNavigation } from "react-router";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { Dialog } from "@/components/ui/Dialog";
import { Spinner } from "@/components/ui/Spinner";
import { useMediaQuery } from "@/hooks/use-media-query";
import styles from "./root-layout.module.css";

export function RootLayout() {
  const navigation = useNavigation();
  const wide = useMediaQuery("(min-width: 48rem)");
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Growing the window past the breakpoint closes the drawer instead of leaving it open, hidden.
  if (wide && drawerOpen) setDrawerOpen(false);

  return (
    <div className={styles.shell}>
      <a href="#main" className={styles.skipLink}>
        Skip to content
      </a>
      {navigation.state === "loading" && <div data-ui="pending-bar" className={styles.pendingBar} aria-hidden="true" />}
      {wide ? (
        <aside className={styles.sidebar}>
          <Sidebar />
        </aside>
      ) : (
        <Dialog open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Navigation" className={styles.drawer}>
          <Sidebar onNavigate={() => setDrawerOpen(false)} />
        </Dialog>
      )}
      <div className={styles.main}>
        <Header onOpenNavigation={wide ? undefined : () => setDrawerOpen(true)} />
        <main id="main" className={styles.content}>
          <Outlet />
        </main>
      </div>
      <ScrollRestoration />
    </div>
  );
}

/** What shows while the first page's middleware and loaders run. */
export function AppLoading() {
  return (
    <div className={styles.appLoading}>
      <Spinner label="Loading Taskboard" />
    </div>
  );
}
