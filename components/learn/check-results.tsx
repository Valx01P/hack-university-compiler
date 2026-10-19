"use client";

import Link from "next/link";
import { useRef } from "react";
import { TypeCheckStrip } from "@/components/compiler/type-check";
import { CompleteIcon } from "@/components/learn/complete-icon";
import { ScrollPre } from "@/components/ui/scroll-pre";
import { EASE, dur, gsap, hasPainted, useGSAP } from "@/lib/motion";
import { joinArgs } from "@/lib/shell-words";
import type { ForbiddenHit, TestVerdict, TypeTestVerdict } from "@/lib/single-checks.mjs";

export interface TestResult {
  stdin: string;
  expected: string;
  actual: string;
  stderr: string;
  passed: boolean;
  /** Tests checked on the runner: what else the test ran with, and how the
      program did on each thing it's held to. */
  detail?: TestDetail;
}

export interface TestDetail {
  args?: string[];
  env?: Record<string, string>;
  /** The test's own fixture set, when it isn't the practice's. */
  fixtures?: string;
  cwd?: string;
  wrap?: string;
  clock?: string;
  sql?: string;
  seed?: Record<string, unknown[]>;
  verdict: TestVerdict;
}

/** A type-test case's verdict, with the code it compiled. */
export type TypeTestResult = TypeTestVerdict & { code: string };

export type CheckState =
  | { status: "checking"; total: number }
  | { status: "error"; error: string }
  | {
      status: "compile-error";
      output: string;
      /** A type-checked program (TypeScript): the errors link to their lines. */
      typeCheck?: { fileName: string };
    }
  | {
      status: "done";
      results: TestResult[];
      lessonComplete: boolean;
      typeTests?: TypeTestResult[];
      forbidden?: ForbiddenHit[];
    };

const NEXT_LINK =
  "font-medium text-ink underline decoration-edge-strong underline-offset-2 transition-colors hover:decoration-ink dark:hover:text-gold";
const LINE_LINK = "underline decoration-edge-strong underline-offset-2 transition-colors hover:decoration-ink";

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;
const all = (n: number, noun: string) => (n === 1 ? `the ${noun}` : `all ${n} ${noun}s`);

/** Every count in a finished check, and whether all of it passed. */
function tally(check: Extract<CheckState, { status: "done" }>) {
  const tests = check.results.length;
  const testsPassed = check.results.filter((r) => r.passed).length;
  const types = check.typeTests?.length ?? 0;
  const typesPassed = check.typeTests?.filter((t) => t.passed).length ?? 0;
  const broken = check.forbidden?.length ?? 0;
  return { tests, testsPassed, types, typesPassed, broken, solved: testsPassed === tests && typesPassed === types && !broken };
}

/** "All 3 tests passed.", with the type tests when there are some. */
function passedLine(tests: number, types: number): string {
  if (!types) return tests === 1 ? "The test passed." : `All ${tests} tests passed.`;
  const both = `${all(tests, "test")} and ${all(types, "type test")} passed.`;
  return both[0].toUpperCase() + both.slice(1);
}

/** What didn't pass, in a sentence or two. */
function failedLine(check: Extract<CheckState, { status: "done" }>): string {
  const t = tally(check);
  let line = `${t.testsPassed} of ${plural(t.tests, "test")} passed`;
  if (t.types) line += `, and ${t.typesPassed} of ${plural(t.types, "type test")} passed`;
  line += ".";
  if (t.broken) line += ` Your code breaks ${t.broken === 1 ? "an honesty rule" : `${t.broken} honesty rules`}.`;
  return line;
}

/** The verdict of a check in one line, for screen readers. */
export function checkSummary(check: CheckState): string {
  switch (check.status) {
    case "checking":
      return "";
    case "error":
      return check.error;
    case "compile-error":
      return check.typeCheck ? "Your code has type errors, so no test ran." : "Your code didn't compile.";
    case "done": {
      const t = tally(check);
      if (!t.solved) return failedLine(check);
      return `Solved! ${passedLine(t.tests, t.types)}${check.lessonComplete ? " Lesson complete." : ""}`;
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
  onGoTo,
}: {
  check: CheckState;
  /** Where to go after solving: a page (`href`) or an action (`onClick`). */
  next: { href?: string; onClick?: () => void; label: string } | null;
  /** Puts the editor's cursor on a line of your code (a type error's or a
      broken rule's link). */
  onGoTo?: (line: number, col: number) => void;
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
    if (check.typeCheck) {
      return (
        <div className="space-y-3 p-4">
          <p className="text-sm font-medium text-ink">Your code has type errors, so no test ran.</p>
          <TypeCheckStrip output={check.output} failed fileName={check.typeCheck.fileName} onGoTo={onGoTo} />
        </div>
      );
    }
    return (
      <div className="space-y-2 p-4">
        <p className="text-sm font-medium text-ink">Your code didn&apos;t compile.</p>
        <pre className="whitespace-pre-wrap font-mono text-sm text-danger">{check.output}</pre>
      </div>
    );
  }

  const { results, lessonComplete, typeTests = [], forbidden = [] } = check;
  const t = tally(check);
  return (
    <div ref={rootRef}>
      {t.solved ? (
        <div data-anim="row" className="flex items-start gap-3 p-4">
          <span data-anim="pop" className="mt-0.5 inline-flex shrink-0">
            <CompleteIcon className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="font-medium text-ink">Solved! {passedLine(t.tests, t.types)}</p>
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
      ) : results.some((r) => r.detail) || t.types > 0 || t.broken > 0 ? (
        // A check on the runner can fail on more than output.
        <p data-anim="row" className="p-4 text-sm font-medium text-ink">
          {failedLine(check)}
        </p>
      ) : (
        <p data-anim="row" className="p-4 text-sm font-medium text-ink">
          {t.testsPassed} of {t.tests} test{t.tests === 1 ? "" : "s"} passed. Compare your
          output with the expected output below.
        </p>
      )}

      {results.map((r, i) => (
        <div key={i} data-anim="row" className="border-t border-content-line px-4 py-3">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-ink-muted">
            {r.passed ? <CompleteIcon className="size-3.5" /> : <span aria-hidden className="text-danger">✗</span>}
            Test {i + 1} {r.passed ? "passed" : "failed"}
          </p>
          {!r.passed &&
            (r.detail ? (
              <RunnerTestDetail test={i + 1} result={r} detail={r.detail} />
            ) : (
              <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
                {r.stdin && <OutputBlock test={i + 1} label="Input" text={r.stdin} className="sm:col-span-2" />}
                <OutputBlock test={i + 1} label="Expected" text={r.expected} />
                <OutputBlock test={i + 1} label="Your output" text={r.actual || "(no output)"} />
                {r.stderr && <OutputBlock test={i + 1} label="Errors" text={r.stderr} className="sm:col-span-2" danger />}
              </div>
            ))}
        </div>
      ))}

      {typeTests.length > 0 && (
        <div data-anim="row" className="border-t border-content-line px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">
            Type tests · {t.typesPassed} of {t.types} passed
          </p>
          <ul className="mt-2 space-y-2.5">
            {typeTests.map((c, i) => (
              <li key={i} className="min-w-0">
                <p className="flex items-start gap-2 text-sm text-ink">
                  <span className="mt-0.5 inline-flex shrink-0">
                    {c.passed ? <CompleteIcon className="size-3.5" /> : <span aria-hidden className="text-danger">✗</span>}
                  </span>
                  <span className="min-w-0">
                    {c.name}
                    <span className="sr-only">{c.passed ? " (passed)" : " (failed)"}</span>
                  </span>
                </p>
                {!c.passed && (
                  <div className="mt-1.5 space-y-1.5 pl-5.5">
                    <p className="text-sm text-ink-muted">{c.message}</p>
                    <ScrollPre label={`Type test: ${c.name}`} className={BLOCK}>
                      {c.code}
                    </ScrollPre>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {forbidden.length > 0 && (
        <div data-anim="row" className="border-t border-content-line px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">Honesty rules</p>
          <ul className="mt-2 space-y-1.5">
            {forbidden.map((h, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-ink">
                <span aria-hidden className="mt-0.5 shrink-0 text-danger">
                  ✗
                </span>
                <span className="min-w-0">
                  {onGoTo ? (
                    <button type="button" onClick={() => onGoTo(h.line, h.col)} className={LINE_LINK}>
                      Line {h.line}
                    </button>
                  ) : (
                    `Line ${h.line}`
                  )}
                  ,{" "}
                  <code className="rounded border border-content-line bg-raised px-1 py-px font-mono text-[0.85em] font-medium">{h.text}</code>:{" "}
                  <span className="text-ink-muted">{h.message}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const BLOCK =
  "code-dark slim-scroll max-h-48 overflow-auto rounded-btn border border-code-content-line bg-code-bg px-3 py-2 font-mono text-xs leading-5 text-code-ink";

/** What a runner test ran with, and every way it fell short: its output,
    exit status, stderr, and the files it left. */
function RunnerTestDetail({ test, result, detail }: { test: number; result: TestResult; detail: TestDetail }) {
  const { verdict } = detail;
  const notes = [
    detail.fixtures && `with the ${detail.fixtures} files`,
    detail.cwd && `from ${detail.cwd}/`,
    detail.wrap && `inside ${detail.wrap}`,
    detail.clock && `at ${detail.clock}`,
  ].filter(Boolean);
  const exit = verdict.exit;
  return (
    <div className="mt-2.5 space-y-2.5">
      {verdict.problem && <p className="text-sm text-ink">{verdict.problem}</p>}
      {notes.length > 0 && <p className="text-xs text-ink-faint">Runs {notes.join(", ")}.</p>}
      <div className="grid gap-2.5 sm:grid-cols-2">
        {detail.args && detail.args.length > 0 && (
          <OutputBlock test={test} label="Arguments" text={joinArgs(detail.args)} className="sm:col-span-2" />
        )}
        {detail.env && Object.keys(detail.env).length > 0 && (
          <OutputBlock
            test={test}
            label="Environment"
            text={Object.entries(detail.env)
              .map(([k, v]) => `${k}=${v}`)
              .join("\n")}
            className="sm:col-span-2"
          />
        )}
        {result.stdin && <OutputBlock test={test} label="Input" text={result.stdin} className="sm:col-span-2" />}
        {detail.sql && <OutputBlock test={test} label="SQL first" text={detail.sql} className="sm:col-span-2" />}
        {detail.seed && (
          <OutputBlock test={test} label="Documents first" text={JSON.stringify(detail.seed, null, 2)} className="sm:col-span-2" />
        )}
        {verdict.output && !verdict.output.passed && (
          <>
            <OutputBlock test={test} label="Expected" text={result.expected} />
            <OutputBlock test={test} label="Your output" text={result.actual || "(no output)"} />
          </>
        )}
        {result.stderr && <OutputBlock test={test} label="Errors" text={result.stderr} className="sm:col-span-2" danger />}
        {verdict.stderrIncludes && !verdict.stderrIncludes.passed && (
          <OutputBlock test={test} label="Errors should include" text={verdict.stderrIncludes.text} className="sm:col-span-2" />
        )}
        {verdict.files
          .filter((f) => !f.passed)
          .map((f) => (
            <div key={f.path} className="grid gap-2.5 sm:col-span-2 sm:grid-cols-2">
              <OutputBlock test={test} label={`Expected ${f.path}`} text={f.expected} />
              <OutputBlock test={test} label={`Your ${f.path}`} text={f.actual ?? "(missing)"} />
            </div>
          ))}
      </div>
      {exit && !exit.passed && !verdict.timedOut && (
        <p className="text-sm text-ink">
          {exit.signal
            ? `It was killed by ${exit.signal}, and should exit with ${exit.expected}.`
            : `It exited with ${exit.actual ?? "no status"}, and should exit with ${exit.expected}.`}
        </p>
      )}
      {verdict.absent
        .filter((a) => !a.passed)
        .map((a) => (
          <p key={a.path} className="text-sm text-ink">
            <code className="font-mono text-[0.9em]">{a.path}</code> should be gone, but it&apos;s still there.
          </p>
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
