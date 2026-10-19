import type { RunState } from "@/lib/run-code";

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

/** The result of one run: output, errors, and why it stopped. Shared by the
    compiler and Learn mode. */
export function OutputPanel({ run }: { run: RunState }) {
  if (run.status === "idle") {
    return (
      <p className="p-4 text-sm text-ink-faint">
        Press ▶ Run to execute your code. Output appears here.
      </p>
    );
  }
  if (run.status === "running") {
    return <p className="p-4 text-sm text-ink-faint">Running…</p>;
  }
  if (run.status === "error") {
    return <p className="p-4 font-mono text-sm text-danger">⚠ {run.error}</p>;
  }
  const compileFailed = run.compileCode != null && run.compileCode !== 0;
  const timedOut = run.verdict === "TO";
  const outputCapped = run.verdict === "OL" || run.verdict === "EL";
  const stopped = timedOut || outputCapped;
  // A clean exit says nothing. A crash or an error code still shows.
  const exitNote = run.signal ? `killed by ${run.signal}` : run.code != null && run.code !== 0 ? `exit code ${run.code}` : null;
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
    <div className="space-y-2 p-4 font-mono text-sm">
      {compileFailed ? (
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
