"use client";

import Link from "next/link";
import { useRef } from "react";
import { CompleteIcon } from "@/components/learn/complete-icon";
import { ScrollPre } from "@/components/ui/scroll-pre";
import { EASE, dur, gsap, hasPainted, useGSAP } from "@/lib/motion";

export interface TestResult {
  stdin: string;
  expected: string;
  actual: string;
  stderr: string;
  passed: boolean;
  /** For a check on the runner: what was wrong (lib/single-checks.mjs
      judgeTest), since a test can fail on its exit code with the right
      output. */
  problems?: string[];
}

/** Whether a failed test's output differs from what was expected. */
const outputWrong = (r: TestResult) => !r.problems || r.problems.includes("wrong output");
/** Whether it failed on more than its output (its exit code, say), which
    the output blocks alone can't show. */
const moreThanOutput = (r: TestResult) => Boolean(r.problems?.some((p) => p !== "wrong output"));

export type CheckState =
  | { status: "checking"; total: number }
  | { status: "error"; error: string }
  | { status: "compile-error"; output: string }
  | { status: "done"; results: TestResult[]; lessonComplete: boolean };

const NEXT_LINK =
  "font-medium text-ink underline decoration-edge-strong underline-offset-2 transition-colors hover:decoration-ink dark:hover:text-gold";

/** The verdict of a check in one line, for screen readers. */
export function checkSummary(check: CheckState): string {
  switch (check.status) {
    case "checking":
      return "";
    case "error":
      return check.error;
    case "compile-error":
      return "Your code didn't compile.";
    case "done": {
      const total = check.results.length;
      const passed = check.results.filter((r) => r.passed).length;
      if (passed < total) return `${passed} of ${total} test${total === 1 ? "" : "s"} passed.`;
      return `Solved! ${total === 1 ? "The test passed." : `All ${total} tests passed.`}${
        check.lessonComplete ? " Lesson complete." : ""
      }`;
    }
  }
}

/** The verdict of a practice check: every test, and what differed. Once it
    passes it points the way on: the next part, or the next lesson after the
    last part. Each new verdict slides in line by line, and a pass pops its
    check mark. */
export function CheckResults({
  check,
  next,
}: {
  check: CheckState;
  /** Where to go after solving: a page (`href`) or an action (`onClick`). */
  next: { href?: string; onClick?: () => void; label: string } | null;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const root = rootRef.current;
      if (check.status !== "done" || !root || !hasPainted()) return;
      gsap.from(root.querySelectorAll("[data-anim=row]"), {
        opacity: 0,
        y: 6,
        duration: dur(0.22),
        ease: EASE.out,
        stagger: dur(0.045),
        clearProps: "opacity,transform",
      });
      const mark = root.querySelector("[data-anim=pop]");
      if (mark) gsap.from(mark, { scale: 0.4, rotate: -25, opacity: 0, duration: dur(0.45), ease: EASE.pop, clearProps: "opacity,transform" });
    },
    { scope: rootRef, dependencies: [check] }
  );

  if (check.status === "checking") {
    return (
      <p className="p-4 text-sm text-ink-faint">
        Checking your code against {check.total} test{check.total === 1 ? "" : "s"}…
      </p>
    );
  }
  if (check.status === "error") {
    return <p className="p-4 font-mono text-sm text-danger">⚠ {check.error}</p>;
  }
  if (check.status === "compile-error") {
    return (
      <div className="space-y-2 p-4">
        <p className="text-sm font-medium text-ink">Your code didn&apos;t compile.</p>
        <pre className="whitespace-pre-wrap font-mono text-sm text-danger">{check.output}</pre>
      </div>
    );
  }

  const { results, lessonComplete } = check;
  const passed = results.filter((r) => r.passed).length;
  const allPassed = passed === results.length;
  // A test on the runner can fail on more than its output, and then lists
  // what was wrong.
  const onlyOutputs = results.every((r) => r.passed || !moreThanOutput(r));
  return (
    <div ref={rootRef}>
      {allPassed ? (
        <div data-anim="row" className="flex items-start gap-3 p-4">
          <span data-anim="pop" className="mt-0.5 inline-flex shrink-0">
            <CompleteIcon className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="font-medium text-ink">
              Solved! {results.length === 1 ? "The test passed." : `All ${results.length} tests passed.`}
            </p>
            {(lessonComplete || next) && (
              <p className="mt-1 text-sm text-ink-muted">
                {lessonComplete && "Lesson complete. "}
                {next?.href ? (
                  <Link href={next.href} className={NEXT_LINK}>
                    {next.label} →
                  </Link>
                ) : next?.onClick ? (
                  <button type="button" onClick={next.onClick} className={NEXT_LINK}>
                    {next.label} →
                  </button>
                ) : (
                  "That was the last lesson in the course."
                )}
              </p>
            )}
          </div>
        </div>
      ) : onlyOutputs ? (
        <p data-anim="row" className="p-4 text-sm font-medium text-ink">
          {passed} of {results.length} test{results.length === 1 ? "" : "s"} passed. Compare your
          output with the expected output below.
        </p>
      ) : (
        <p data-anim="row" className="p-4 text-sm font-medium text-ink">
          {passed} of {results.length} test{results.length === 1 ? "" : "s"} passed.
        </p>
      )}

      {results.map((r, i) => (
        <div key={i} data-anim="row" className="border-t border-content-line px-4 py-3">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-ink-muted">
            {r.passed ? <CompleteIcon className="size-3.5" /> : <span aria-hidden className="text-danger">✗</span>}
            Test {i + 1} {r.passed ? "passed" : "failed"}
          </p>
          {!r.passed && r.problems && moreThanOutput(r) && (
            <ul className="mt-2.5 list-disc space-y-0.5 pl-5 text-sm text-ink marker:text-ink-faint">
              {r.problems.map((p, k) => (
                <li key={k}>{sentence(p)}</li>
              ))}
            </ul>
          )}
          {/* The expected and actual output show only when they differ. */}
          {!r.passed && (r.stdin || outputWrong(r) || r.stderr) && (
            <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
              {r.stdin && <OutputBlock test={i + 1} label="Input" text={r.stdin} className="sm:col-span-2" />}
              {outputWrong(r) && (
                <>
                  <OutputBlock test={i + 1} label="Expected" text={r.expected} />
                  <OutputBlock test={i + 1} label="Your output" text={r.actual || "(no output)"} />
                </>
              )}
              {r.stderr && <OutputBlock test={i + 1} label="Errors" text={r.stderr} className="sm:col-span-2" danger />}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** A judge's note as a sentence: "wrong output" reads "Wrong output.", and
    one that starts with a file name or code keeps it as written. */
function sentence(text: string): string {
  const s = /^[a-z]+\s/.test(text) ? text.charAt(0).toUpperCase() + text.slice(1) : text;
  return /[.!?]$/.test(s) ? s : `${s}.`;
}

function OutputBlock({
  test,
  label,
  text,
  className = "",
  danger = false,
}: {
  test: number;
  label: string;
  text: string;
  className?: string;
  danger?: boolean;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <p className="mb-1 text-xs text-ink-faint">{label}</p>
      <ScrollPre
        label={`Test ${test}: ${label}`}
        // The terminal look of every output block in lessons.
        className={`code-dark slim-scroll max-h-48 overflow-auto rounded-btn border border-code-content-line bg-code-bg px-3 py-2 font-mono text-xs leading-5 ${
          danger ? "text-danger" : "text-code-ink"
        }`}
      >
        {text}
      </ScrollPre>
    </div>
  );
}
