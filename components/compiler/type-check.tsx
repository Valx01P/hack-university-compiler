import { CompleteIcon } from "@/components/learn/complete-icon";
import type { EditorDiagnostic } from "@/lib/editor-diagnostics";
import { parseTscOutput } from "@/lib/single-checks.mjs";

// Where a line of tsc --pretty false output points: main.ts(14,11): …
const LOCATION = /^(.+?)\((\d+),(\d+)\): /;

/** Whether a file the type checker names is the program being edited
    (`main.ts`), so an error there can link to its line. */
const isProgram = (file: string, fileName: string) => file === fileName || file.endsWith(`/${fileName}`);

/** The type errors in the program being edited, from what the type checker
    printed, for the editor to underline. */
export function programTypeErrors(output: string, fileName: string): EditorDiagnostic[] {
  return parseTscOutput(output)
    .filter((d) => isProgram(d.file, fileName))
    .map((d) => ({ line: d.line, col: d.col, message: `${d.code}: ${d.message}` }));
}

/**
 * The type check of a TypeScript program, above its output: "No type
 * errors", or what the checker printed, with each error's place as a link
 * that puts the cursor on its line (the editor underlines it too). Shared
 * by the compiler and Learn mode.
 */
export function TypeCheckStrip({
  output,
  failed,
  fileName,
  onGoTo,
  className = "",
}: {
  /** What the type checker printed (`tsc --pretty false`). */
  output: string;
  /** It found errors (a non-zero exit). */
  failed: boolean;
  fileName: string;
  onGoTo?: (line: number, col: number) => void;
  className?: string;
}) {
  const count = failed ? parseTscOutput(output).length : 0;
  const lines = output.replace(/\r\n/g, "\n").replace(/\n+$/, "").split("\n");
  return (
    <div className={`font-mono text-sm ${className}`}>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-sans text-xs">
        <span className="font-medium uppercase tracking-wider text-ink-muted">Type check</span>
        {failed ? (
          <span className="text-ink">{count === 1 ? "1 type error" : count > 1 ? `${count} type errors` : "Failed"}</span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-ink">
            <CompleteIcon className="size-3.5" />
            No type errors
          </span>
        )}
      </p>
      {failed && (
        <pre className="mt-2 whitespace-pre-wrap text-danger">
          {output.trim()
            ? lines.map((line, i) => {
                const at = LOCATION.exec(line);
                const link = at && onGoTo && isProgram(at[1], fileName);
                return (
                  <span key={i}>
                    {i > 0 && "\n"}
                    {link ? (
                      <>
                        <button
                          type="button"
                          onClick={() => onGoTo(Number(at[2]), Number(at[3]))}
                          title={`Go to line ${at[2]}, column ${at[3]}`}
                          className="underline decoration-edge-strong underline-offset-2 transition-colors hover:decoration-ink"
                        >
                          {at[0].slice(0, -2)}
                        </button>
                        {line.slice(at[0].length - 2)}
                      </>
                    ) : (
                      line
                    )}
                  </span>
                );
              })
            : "The type check failed."}
        </pre>
      )}
    </div>
  );
}
