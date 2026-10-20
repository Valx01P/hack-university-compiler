// /settings/danger, for admins only: requireRole("admin") middleware sends everyone else a 403.
// Hiding the link from members is only a convenience; the route and the API are the real guards.
// Its one action resets the mock API's data, which only this project's mock supports.
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/Button";
import styles from "./Settings.module.css";

// Another backend (VITE_API_BASE set to an address) has no /_hu routes.
const USING_MOCK = !/^https?:\/\//.test(import.meta.env.VITE_API_BASE ?? "");

export function DangerZone() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<"idle" | "resetting" | "failed">("idle");

  async function resetDemoData() {
    setStatus("resetting");
    const response = await fetch("/_hu/reset", { method: "POST" }).catch(() => null);
    if (!response?.ok) return setStatus("failed");
    // The reset ended every session, including this one.
    await navigate("/login", { replace: true });
    queryClient.clear();
  }

  return (
    <section className={styles.page} aria-labelledby="danger-heading">
      <title>Danger zone · Taskboard</title>
      <h1 id="danger-heading">Danger zone</h1>
      <div className={styles.danger}>
        <h2>Reset the demo data</h2>
        <p>Puts every project, task, and comment back the way the seed has them, and logs everyone out.</p>
        {USING_MOCK ? (
          <Button variant="danger" onClick={resetDemoData} disabled={status === "resetting"}>
            {status === "resetting" ? "Resetting..." : "Reset demo data"}
          </Button>
        ) : (
          <p>Only the mock API in this project can reset its data.</p>
        )}
        {status === "failed" && <p role="alert">The reset failed. Is the mock API running?</p>}
      </div>
    </section>
  );
}
