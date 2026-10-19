"use client";

import Link from "next/link";
import { useRef } from "react";
import { TypeCheckStrip } from "@/components/compiler/type-check";
import { CompleteIcon } from "@/components/learn/complete-icon";
import { ScrollPre } from "@/components/ui/scroll-pre";
import type { LessonTest } from "@/lib/learn-types";
import { EASE, dur, gsap, hasPainted, useGSAP } from "@/lib/motion";
import { normalizeOutput, type RunResult } from "@/lib/run-code";
import { joinArgs } from "@/lib/shell-words";
import { FORBID_RULES, type ForbidRule } from "@/lib/single-checks.mjs";

export interface TestResult {
  stdin: string;
  expected: string;
  actual: string;
  stderr: string;
  passed: boolean;
  /** Tests checked on the runner: the test as written, its run, and what
      was wrong (lib/single-checks.mjs judgeTest), so the result can show
      everything the program is held to. */
  detail?: { test: LessonTest; run: RunResult; problems: string[] };
}

/** A type-test case's verdict, with the code it compiled. */
export interface TypeTestResult {
  name: string;
  passed: boolean;
  problem: string | null;
  code: string;
}

/** A line of your code that breaks one of the practice's honesty rules. */
export interface ForbiddenUse {
  rule: ForbidRule;
  line: number;
  text: string;
}

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
      forbidden?: ForbiddenUse[];
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
                    {c.problem && <p className="text-sm text-ink-muted">{sentence(c.problem)}</p>}
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
          <ul className="mt-2 space-y-2.5">
            {forbidden.map((h, i) => (
              <li key={i} className="min-w-0">
                <p className="flex items-start gap-2 text-sm text-ink">
                  <span aria-hidden className="mt-0.5 shrink-0 text-danger">
                    ✗
                  </span>
                  <span className="min-w-0">
                    {onGoTo ? (
                      <button type="button" onClick={() => onGoTo(h.line, 1)} className={LINE_LINK}>
                        Line {h.line}
                      </button>
                    ) : (
                      `Line ${h.line}`
                    )}
                    : <WithCode text={sentence(FORBID_RULES[h.rule])} />
                  </span>
                </p>
                <ScrollPre label={`Line ${h.line}`} className={`${BLOCK} mt-1.5 ml-5.5`}>
                  {h.text}
                </ScrollPre>
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

/** A judge's note as a sentence: "wrong output" reads "Wrong output.", and
    one that starts with a file name or code keeps it as written. */
function sentence(text: string): string {
  const s = /^[a-z]+\s/.test(text) ? text.charAt(0).toUpperCase() + text.slice(1) : text;
  return /[.!?]$/.test(s) ? s : `${s}.`;
}

/** Text with `code` in backquotes set as code. */
function WithCode({ text }: { text: string }) {
  return (
    <>
      {text.split("`").map((part, i) =>
        i % 2 ? (
          <code key={i} className="rounded border border-content-line bg-raised px-1 py-px font-mono text-[0.85em] font-medium">
            {part}
          </code>
        ) : (
          part
        )
      )}
    </>
  );
}

/** What a runner test ran with, and every way it fell short: its output,
    exit status, stderr, and the files it left. */
function RunnerTestDetail({ test: n, result, detail }: { test: number; result: TestResult; detail: NonNullable<TestResult["detail"]> }) {
  const { test, run, problems } = detail;
  const timedOut = run.verdict === "TO";
  const outputWrong = timedOut || normalizeOutput(run.stdout) !== normalizeOutput(test.output);
  const stderrMissing = test.stderrIncludes != null && !run.stderr.includes(test.stderrIncludes);
  const files = Object.entries(test.files ?? {}).filter(
    ([path, want]) => run.files?.[path] == null || normalizeOutput(run.files[path]) !== normalizeOutput(want)
  );
  const notes = [
    test.fixtures && `with the ${test.fixtures} files`,
    test.cwd && `from ${test.cwd}/`,
    test.wrap && `inside ${typeof test.wrap === "string" ? test.wrap : joinArgs(test.wrap)}`,
    test.clock && `at ${test.clock}`,
  ].filter(Boolean);
  return (
    <div className="mt-2.5 space-y-2.5">
      {problems.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-sm text-ink marker:text-ink-faint">
          {problems.map((p, i) => (
            <li key={i}>{sentence(p)}</li>
          ))}
        </ul>
      )}
      {notes.length > 0 && <p className="text-xs text-ink-faint">It runs {notes.join(", ")}.</p>}
      <div className="grid gap-2.5 sm:grid-cols-2">
        {test.args && test.args.length > 0 && (
          <OutputBlock test={n} label="Arguments" text={joinArgs(test.args)} className="sm:col-span-2" />
        )}
        {test.env && Object.keys(test.env).length > 0 && (
          <OutputBlock
            test={n}
            label="Environment"
            text={Object.entries(test.env)
              .map(([k, v]) => `${k}=${v}`)
              .join("\n")}
            className="sm:col-span-2"
          />
        )}
        {result.stdin && <OutputBlock test={n} label="Input" text={result.stdin} className="sm:col-span-2" />}
        {test.sql && <OutputBlock test={n} label="SQL first" text={test.sql} className="sm:col-span-2" />}
        {test.seed && <OutputBlock test={n} label="Documents first" text={JSON.stringify(test.seed, null, 2)} className="sm:col-span-2" />}
        {outputWrong && (
          <>
            <OutputBlock test={n} label="Expected" text={result.expected || "(no output)"} />
            <OutputBlock test={n} label="Your output" text={result.actual || "(no output)"} />
          </>
        )}
        {result.stderr && <OutputBlock test={n} label="Errors" text={result.stderr} className="sm:col-span-2" danger />}
        {stderrMissing && <OutputBlock test={n} label="Errors should include" text={test.stderrIncludes!} className="sm:col-span-2" />}
        {files.map(([path, want]) => {
          const got = run.files?.[path];
          return (
            <div key={path} className="grid gap-2.5 sm:col-span-2 sm:grid-cols-2">
              <OutputBlock test={n} label={`Expected ${path}`} text={want || "(empty)"} />
              <OutputBlock test={n} label={`Your ${path}`} text={got == null ? "(missing)" : got || "(empty)"} />
            </div>
          );
        })}
      </div>
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
