"use client";

import { useCallback, useEffect, useState } from "react";
import { SANDBOX_REFRESH_EVENT } from "@/lib/compiler";

type Status = {
  online: boolean;
  runtimes: Record<string, { name: string; version: string }>;
};

/**
 * Small badge in the shell bar: which runtime runs this language in the local
 * sandbox (e.g. "node 20.11.1"), or what to do when it can't run yet. Re-checks
 * on focus, so starting Piston or installing a runtime in a terminal shows up
 * as soon as you come back to the tab, and after every run.
 */
export function SandboxStatus({ lang }: { lang: string }) {
  const [status, setStatus] = useState<Status | null>(null);

  const refresh = useCallback(() => {
    fetch("/api/runtimes", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Status | null) => setStatus(d ?? { online: false, runtimes: {} }))
      .catch(() => setStatus({ online: false, runtimes: {} }));
  }, []);

  useEffect(() => {
    refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener(SANDBOX_REFRESH_EVENT, refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener(SANDBOX_REFRESH_EVENT, refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  if (!status) return null;

  const runtime = status.runtimes[lang];
  const ready = status.online && !!runtime;
  const label = !status.online
    ? "sandbox offline"
    : runtime
      ? `${runtime.name} ${runtime.version}`
      : "not installed";
  const hint = !status.online
    ? "The local sandbox isn't running. Start it with: npm run piston:up"
    : runtime
      ? `Runs on ${runtime.name} ${runtime.version} in your local sandbox`
      : `Install this language with: npm run piston:install -- ${lang}`;

  return (
    <span
      title={hint}
      className="inline-flex shrink-0 items-center gap-1.5 px-1 font-mono text-xs text-ink-faint"
    >
      <span
        aria-hidden
        className={`size-1.5 shrink-0 rounded-full ${
          ready ? "bg-gold" : "border border-ink-faint"
        }`}
      />
      {label}
    </span>
  );
}
