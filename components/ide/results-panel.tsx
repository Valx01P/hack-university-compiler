"use client";

import Link from "next/link";
import { useId, useRef } from "react";
import { CompleteIcon } from "@/components/learn/complete-icon";
import { useOneOpen } from "@/components/ui/one-open";
import { ScrollPre } from "@/components/ui/scroll-pre";
import { EASE, dur, gsap, hasPainted, useGSAP } from "@/lib/motion";
import type { CheckTest } from "@/lib/workspace-types";
import { useStore, type WorkspaceStore } from "@/lib/workspace-store";

/**
 * The Results panel (architecture §7.3, §8.3): Check, one acceptance
 * criterion per row, each as it finishes, in the look of the single-file
 * check results (components/learn/check-results.tsx): the criterion in
 * words, what was expected and what came back, the HTTP exchange when a
 * request failed, and a link to the file and line. A suite that couldn't run
 * (a compile error, a timeout) is an error card, never failing tests. Rows
 * slide in as they arrive and a full pass pops its mark, answering your
 * Check, never the page load. A criterion with more to show opens on a
 * click, at once and one at a time, all closed again for each new Check.
 */

export function checkSummary(tests: CheckTest[]): string {
  const counted = tests.filter((t) => t.status !== "skip");
  const passed = counted.filter((t) => t.status === "pass").length;
  return `${passed} of ${counted.length} criteria pass`;
}

export function ResultsPanel({ store, next }: { store: WorkspaceStore; next: { href: string; label: string } | null }) {
  useStore(store, "check");
  const rootRef = useRef<HTMLDivElement>(null);
  const check = store.check;
  const tests = check.status === "running" ? check.tests : check.status === "done" ? check.result.tests : [];
  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root || !hasPainted()) return;
      const fresh = root.querySelectorAll("[data-anim=row]:not([data-shown])");
      fresh.forEach((el) => el.setAttribute("data-shown", ""));
      if (fresh.length) gsap.from(fresh, { opacity: 0, y: 6, duration: dur(0.22), ease: EASE.out, stagger: dur(0.045), clearProps: "opacity,transform" });
      const mark = root.querySelector("[data-anim=pop]:not([data-shown])");
      if (mark) {
        mark.setAttribute("data-shown", "");
        gsap.from(mark, { scale: 0.4, rotate: -25, opacity: 0, duration: dur(0.45), ease: EASE.pop, clearProps: "opacity,transform" });
      }
    },
    { scope: rootRef, dependencies: [tests.length, check.status] }
  );
  // Each Check that starts begins with every row closed (rows arriving
  // during it leave the open one open).
  const runs = useRef({ status: check.status, n: 0 });
  if (check.status === "running" && runs.current.status !== "running") runs.current.n++;
  runs.current.status = check.status;
  const { openId, toggle } = useOneOpen(runs.current.n);
  const uid = useId();

  if (check.status === "idle") {
    return <p className="p-4 text-sm text-ink-faint">Check runs the hidden checks on a fresh copy of your files. Results show here, one criterion at a time.</p>;
  }
  if (check.status === "error") return <p className="p-4 text-sm text-ink">⚠ {check.error}</p>;
  const result = check.status === "done" ? check.result : null;
  const passed = result && result.status === "passed";
  return (
    <div ref={rootRef} className="slim-scroll h-full overflow-auto p-3 text-sm">
      <p className="mb-2 flex items-center gap-2 text-ink" role="status">
        {passed && (
          <span data-anim="pop" className="inline-flex">
            <CompleteIcon className="size-4" />
          </span>
        )}
        {check.status === "running"
          ? tests.length
            ? `Checking… ${checkSummary(tests)} so far.`
            : "Checking a fresh copy of your files…"
          : result?.infra
            ? "The checks couldn't run."
            : passed
              ? `All ${tests.length} criteria pass.`
              : `${checkSummary(tests)}.`}
        {passed && next && (
          <Link href={next.href} className="ml-1 font-medium underline decoration-edge-strong underline-offset-2 hover:decoration-ink dark:hover:text-gold">
            {next.label}
          </Link>
        )}
      </p>
      {result?.infra && (
        <div className="mb-3 rounded-card border border-line-strong p-3">
          <p className="font-medium text-ink">
            {result.infra.kind === "compile"
              ? "Your code didn't build, so no check ran."
              : result.infra.kind === "timeout" || result.status === "timeout"
                ? "The checks ran out of time."
                : result.infra.kind === "oom"
                  ? "The checks ran out of memory."
                  : "The checks couldn't run."}
          </p>
          {result.infra.message && <p className="mt-1 text-ink-muted">{result.infra.message}</p>}
          {(result.infra.output || result.logs?.build) && (
            <Output label="Build output" text={result.infra.output ?? result.logs?.build ?? ""} store={store} />
          )}
        </div>
      )}
      <ul className="space-y-2">
        {tests.map((t) => {
          const id = `${uid}-${t.id}`;
          const open = openId === id;
          const failed = t.status !== "pass";
          const hasDetail = (failed && !!t.message) || !!t.location || t.expected !== undefined || t.actual !== undefined || !!t.request;
          const head = (
            <>
              <span className="mt-[3px] inline-flex size-3.5 shrink-0 items-center justify-center">
                {t.status === "pass" ? (
                  <CompleteIcon className="size-3.5" />
                ) : t.status === "skip" ? (
                  <span aria-hidden className="text-xs leading-none text-ink-faint">–</span>
                ) : (
                  <span aria-hidden className="text-xs leading-none text-danger">✗</span>
                )}
              </span>
              <span className="min-w-0 flex-1 text-ink">
                {t.title}
                <span className="sr-only"> ({t.status})</span>
              </span>
            </>
          );
          return (
            <li key={t.id} data-anim="row" className="overflow-hidden rounded-btn border border-line">
              {hasDetail ? (
                // The whole row is the button, the focus ring inside it.
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={open ? id : undefined}
                  onClick={() => toggle(id)}
                  className="flex w-full items-start gap-2 px-3 py-2 text-left focus-visible:outline-offset-[-3px]!"
                >
                  {head}
                </button>
              ) : (
                <div className="flex items-start gap-2 px-3 py-2">{head}</div>
              )}
              {hasDetail && open && (
                // Under the title: the row's padding, the mark, and its gap.
                <div id={id} className="pb-2 pl-8.5 pr-3">
                  {failed && t.message && <p className="text-ink-muted">{t.message}</p>}
                  {t.location && (
                    <button
                      type="button"
                      onClick={() => store.openFile(t.location!.file, { line: t.location!.line })}
                      className="mt-0.5 font-mono text-xs text-ink-muted underline decoration-edge-strong underline-offset-2 hover:decoration-ink"
                    >
                      {t.location.file}:{t.location.line}
                    </button>
                  )}
                  {(t.expected !== undefined || t.actual !== undefined) && (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {t.expected !== undefined && <Output label="Expected" text={t.expected} store={store} />}
                      {t.actual !== undefined && <Output label="Got" text={t.actual} store={store} />}
                    </div>
                  )}
                  {t.request && (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <Output
                        label="Request"
                        text={`${t.request.method} ${t.request.path}\n${Object.entries(t.request.headers ?? {})
                          .map(([k, v]) => `${k}: ${v}`)
                          .join("\n")}${t.request.body ? `\n\n${t.request.body}` : ""}`}
                        store={store}
                      />
                      {t.response && (
                        <Output
                          label="Response"
                          text={`${t.response.status}\n${Object.entries(t.response.headers ?? {})
                            .map(([k, v]) => `${k}: ${v}`)
                            .join("\n")}${t.response.body ? `\n\n${t.response.body}` : ""}`}
                          store={store}
                        />
                      )}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Output({ label, text }: { label: string; text: string; store: WorkspaceStore }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs text-ink-faint">{label}</p>
      <ScrollPre
        label={label}
        className="code-dark slim-scroll max-h-48 overflow-auto rounded-btn border border-code-content-line bg-code-bg px-3 py-2 font-mono text-xs leading-5 text-code-ink"
      >
        {text}
      </ScrollPre>
    </div>
  );
}
