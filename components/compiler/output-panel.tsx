import type { RunState } from "@/lib/run-code";

/** The padding of what an output box says (its output, a message, a
    placeholder): the top and bottom from the box's `--output-py`, which the
    compiler and Learn make smaller under the editor, where height is short,
    and 1rem anywhere that doesn't set it (code examples). */
export const OUTPUT_PAD = "px-4 py-[var(--output-py,1rem)]";

// A runaway loop can print a megabyte: show the start of it, not all of it.
const SHOWN_LINES = 1000;

/** The first SHOWN_LINES lines of some output, and how many more there are. */
function clipLines(text: string): { shown: string; more: number } {
  let at = -1;
  for (let n = 0; n < SHOWN_LINES; n++) {
    at = text.indexOf("\n", at + 1);
    if (at < 0) return { shown: text, more: 0 };
  }
  const rest = text.slice(at + 1).replace(/\n$/, "");
  return rest ? { shown: text.slice(0, at + 1), more: rest.split("\n").length } : { shown: text, more: 0 };
}

function Clipped({ text, className }: { text: string; className: string }) {
  const { shown, more } = clipLines(text);
  return (
    <>
      <pre className={className}>{shown}</pre>
      {more > 0 && <p className="text-xs text-ink-faint">… {more.toLocaleString("en-US")} more lines</p>}
    </>
  );
}

/** What an exit code means when the sandbox, not the program, chose it: the
    memory limit (the same 512 MB in Piston and on the runner), and a crash
    reading memory it shouldn't, which in these programs is almost always
    recursion too deep for the stack or an index past an array's end. */
const EXIT_MEANING: Record<number, string> = {
  137: ": stopped for using more than its 512 MB of memory",
  139: ": a segmentation fault, usually recursion too deep or an index past the end",
};

/** The result of one run: output, errors, and why it stopped, and a line
    under the output for an error code or a kill signal. Shared by the
    compiler and Learn mode. A `typeChecked` program's type errors show in
    the Type check strip, so a run they stopped just says it didn't run. */
export function OutputPanel({
  run,
  typeChecked = false,
}: {
  run: RunState;
  typeChecked?: boolean;
}) {
  if (run.status === "idle") {
    return (
      <p className={`${OUTPUT_PAD} text-sm text-ink-faint`}>
        Press ▶ Run to execute your code. Output appears here.
      </p>
    );
  }
  if (run.status === "running") {
    return <p className={`${OUTPUT_PAD} text-sm text-ink-faint`}>Running…</p>;
  }
  if (run.status === "error") {
    return <p className={`${OUTPUT_PAD} font-mono text-sm text-danger`}>⚠ {run.error}</p>;
  }
  const compileFailed = run.compileCode != null && run.compileCode !== 0;
  const timedOut = run.verdict === "TO";
  const outputCapped = run.verdict === "OL" || run.verdict === "EL";
  const stopped = timedOut || outputCapped;
  // A clean exit says nothing. A crash or an error code still shows, with
  // what the two a sandbox ends a program with mean.
  const exitNote = run.signal
    ? `killed by ${run.signal}`
    : run.code != null && run.code !== 0
      ? `exit code ${run.code}${EXIT_MEANING[run.code] ?? ""}`
      : null;
  // Why it stopped comes first, so a flood of output can't bury it.
  const stopNotice = timedOut ? (
    <pre className="whitespace-pre-wrap text-danger">
      Timed out. Your code ran too long (usually an infinite loop, or far too
      slow). It was stopped.
    </pre>
  ) : outputCapped ? (
    <pre className="whitespace-pre-wrap text-danger">
      Output limit reached. Your program printed too much, so it was stopped.
    </pre>
  ) : null;
  return (
    <div className={`space-y-2 ${OUTPUT_PAD} font-mono text-sm`}>
      {compileFailed && typeChecked ? (
        <p className="text-ink-faint">(it didn&apos;t run: fix the type errors first)</p>
      ) : compileFailed ? (
        <pre className="whitespace-pre-wrap text-danger">
          {run.compileOutput || "Compilation failed."}
        </pre>
      ) : (
        <>
          {stopNotice}
          {run.stdout && <Clipped text={run.stdout} className="whitespace-pre-wrap text-ink" />}
          {run.stderr && <Clipped text={run.stderr} className="whitespace-pre-wrap text-danger" />}
          {!run.stdout && !run.stderr && !stopped && (
            <p className="text-ink-faint">(no output)</p>
          )}
        </>
      )}
      {!compileFailed && !stopped && exitNote && <p className="text-xs text-ink-faint">{exitNote}</p>}
    </div>
  );
}
