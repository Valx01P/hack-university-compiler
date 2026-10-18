import type { RunState } from "@/lib/run-code";

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
  return (
    <div className="space-y-2 p-4 font-mono text-sm">
      {compileFailed ? (
        <pre className="whitespace-pre-wrap text-danger">
          {run.compileOutput || "Compilation failed."}
        </pre>
      ) : (
        <>
          {run.stdout && <pre className="whitespace-pre-wrap text-ink">{run.stdout}</pre>}
          {run.stderr && <pre className="whitespace-pre-wrap text-danger">{run.stderr}</pre>}
          {timedOut && (
            <pre className="whitespace-pre-wrap text-danger">
              Timed out. Your code ran too long (usually an infinite loop, or far too
              slow). It was stopped.
            </pre>
          )}
          {outputCapped && (
            <pre className="whitespace-pre-wrap text-danger">
              Output limit reached. Your program printed too much, so it was stopped.
            </pre>
          )}
          {!run.stdout && !run.stderr && !stopped && (
            <p className="text-ink-faint">(no output)</p>
          )}
        </>
      )}
      {!compileFailed && !stopped && (
        <p className="text-xs text-ink-faint">
          {run.signal ? `killed by ${run.signal}` : `exit code ${run.code ?? "?"}`}
        </p>
      )}
    </div>
  );
}
