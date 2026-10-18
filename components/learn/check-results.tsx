"use client";

import Link from "next/link";
import { CompleteIcon } from "@/components/learn/complete-icon";
import { ScrollPre } from "@/components/ui/scroll-pre";

export interface TestResult {
  stdin: string;
  expected: string;
  actual: string;
  stderr: string;
  passed: boolean;
}

export type CheckState =
  | { status: "checking"; total: number }
  | { status: "error"; error: string }
  | { status: "compile-error"; output: string }
  | { status: "done"; results: TestResult[]; lessonComplete: boolean };

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

/** The verdict of a practice check: every test, and what differed. */
export function CheckResults({
  check,
  next,
}: {
  check: CheckState;
  next: { href: string; title: string } | null;
}) {
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
  return (
    <div>
      {allPassed ? (
        <div className="flex items-start gap-3 p-4">
          <CompleteIcon className="mt-0.5 size-5" />
          <div className="min-w-0">
            <p className="font-medium text-ink">
              Solved! {results.length === 1 ? "The test passed." : `All ${results.length} tests passed.`}
            </p>
            {lessonComplete && (
              <p className="mt-1 text-sm text-ink-muted">
                Lesson complete.{" "}
                {next ? (
                  <Link href={next.href} className="font-medium text-ink underline decoration-edge-strong underline-offset-2 transition-colors hover:decoration-ink dark:hover:text-gold">
                    Next: {next.title} →
                  </Link>
                ) : (
                  "That was the last lesson in the course."
                )}
              </p>
            )}
          </div>
        </div>
      ) : (
        <p className="p-4 text-sm font-medium text-ink">
          {passed} of {results.length} test{results.length === 1 ? "" : "s"} passed. Compare your
          output with the expected output below.
        </p>
      )}

      {results.map((r, i) => (
        <div key={i} className="border-t border-edge px-4 py-3">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-ink-muted">
            {r.passed ? <CompleteIcon className="size-3.5" /> : <span aria-hidden className="text-danger">✗</span>}
            Test {i + 1} {r.passed ? "passed" : "failed"}
          </p>
          {!r.passed && (
            <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
              {r.stdin && <OutputBlock test={i + 1} label="Input" text={r.stdin} className="sm:col-span-2" />}
              <OutputBlock test={i + 1} label="Expected" text={r.expected} />
              <OutputBlock test={i + 1} label="Your output" text={r.actual || "(no output)"} />
              {r.stderr && <OutputBlock test={i + 1} label="Errors" text={r.stderr} className="sm:col-span-2" danger />}
            </div>
          )}
        </div>
      ))}
    </div>
  );
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
        className={`slim-scroll max-h-48 overflow-auto rounded-btn border border-edge bg-raised px-3 py-2 font-mono text-xs leading-5 ${
          danger ? "text-danger" : "text-ink"
        }`}
      >
        {text}
      </ScrollPre>
    </div>
  );
}
