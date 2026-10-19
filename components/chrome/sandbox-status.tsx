"use client";

import { useCallback, useEffect, useState } from "react";
import { RUNNER_LABELS, SANDBOX_REFRESH_EVENT, isSql, onRunner } from "@/lib/compiler";
import { getCourseEntry, parseRuntime } from "@/lib/courses";

type Status = {
  online: boolean;
  runtimes: Record<string, { name: string; version: string }>;
  runner?: { online: boolean; docker: "ready" | "down" | "waking" | null; recipes: Record<string, string> };
};

/**
 * Small badge in the shell bar: which runtime runs this language in the local
 * sandbox (e.g. "node 20.11.1"), or what to do when it can't run yet. Re-checks
 * on focus, so starting Piston or installing a runtime in a terminal shows up
 * as soon as you come back to the tab, and after every run.
 */
export function SandboxStatus({ lang }: { lang: string }) {
  if (isSql(lang)) return <SqlStatus />;
  if (onRunner(lang)) return <RunnerStatus lang={lang} />;
  return <PistonStatus lang={lang} />;
}

/** SQL runs on PostgreSQL inside the browser, so there's nothing to check. */
function SqlStatus() {
  return (
    <span
      title="Runs on PostgreSQL 18 (PGlite) right in your browser"
      className="inline-flex shrink-0 items-center gap-1.5 px-1 font-mono text-xs text-ink-faint"
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-gold" />
      postgres 18
    </span>
  );
}

/** /api/runtimes, fetched now, on focus, and after every run. */
function useSandboxStatus(): Status | null {
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

  return status;
}

function Badge({ ready, label, hint }: { ready: boolean; label: string; hint: string }) {
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

function PistonStatus({ lang }: { lang: string }) {
  const status = useSandboxStatus();
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

  return <Badge ready={ready} label={label} hint={hint} />;
}

/**
 * TypeScript and Bash run on the local runner, which needs Docker. The badge
 * names what runs them, says the course's image isn't built yet, or that
 * Docker (or the runner, which npm run up starts with it) is off. Its slot is
 * as wide as its longest label from the first paint, so nothing moves when
 * the answer comes in.
 */
function RunnerStatus({ lang }: { lang: string }) {
  const status = useSandboxStatus();
  const name = RUNNER_LABELS[lang] ?? lang;
  const runner = status?.runner;
  const docker = runner?.online ? runner.docker : null;
  // The recipe's image, when the runner says (a missing one builds with npm run up).
  const image = runner?.recipes?.[parseRuntime(getCourseEntry(lang)?.runtime ?? "")?.id ?? ""];
  const built = !image || image === "ready";
  const ready = docker === "ready" && built;
  const label =
    docker === "ready" ? (built ? name : "not installed") : docker === "waking" ? "waking docker" : "sandbox offline";
  const hint =
    docker === "ready"
      ? built
        ? `Runs on ${name} in a fresh container on your machine`
        : image === "building"
          ? "This course's sandbox is being built. It runs once that's done."
          : "This course's sandbox isn't built yet. Build it with: npm run up"
      : docker === "waking"
        ? "Docker is waking up. Run again in a moment."
        : runner?.online
          ? "Start Docker to run this."
          : "Start Docker to run this. npm run up starts the runner with it.";

  return (
    <span className="inline-grid shrink-0">
      {[name, "sandbox offline", "not installed", "waking docker"].map((text) => (
        <span key={text} aria-hidden className="invisible col-start-1 row-start-1 justify-self-end">
          <Badge ready label={text} hint="" />
        </span>
      ))}
      <span className={`col-start-1 row-start-1 justify-self-end ${status ? "" : "invisible"}`}>
        <Badge ready={ready} label={label} hint={hint} />
      </span>
    </span>
  );
}
