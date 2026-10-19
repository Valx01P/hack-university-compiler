import { CompleteIcon } from "@/components/learn/complete-icon";
import type { EditorDiagnostic } from "@/lib/editor-diagnostics";
import { parseTscOutput, type TscDiagnostic } from "@/lib/single-checks.mjs";

/** Whether a type error points into the program being edited (`main.ts`),
    so it can link to a line there. */
const inFile = (d: TscDiagnostic, fileName: string) =>
  d.line != null && d.col != null && (d.file === fileName || Boolean(d.file?.endsWith(`/${fileName}`)));

/** The type errors in the program being edited, from what the type checker
    printed (`tsc --pretty false`), for the editor to underline. */
export function programTypeErrors(output: string, fileName: string): EditorDiagnostic[] {
  return parseTscOutput(output)
    .filter((d) => inFile(d, fileName))
    .map((d) => ({ line: d.line!, col: d.col!, message: `${d.code}: ${d.message}` }));
}

/**
 * The type check of a TypeScript program, above its output: "No type
 * errors", or each error as a link that puts the cursor on its line (the
 * editor underlines it too). Shared by the compiler and Learn mode.
 */
export function TypeCheckStrip({
  output,
  failed,
  fileName,
  onGoTo,
  className = "",
}: {
  /** What the type checker printed. */
  output: string;
  /** It found errors (a non-zero exit), even when none parse. */
  failed: boolean;
  fileName: string;
  onGoTo?: (line: number, col: number) => void;
  className?: string;
}) {
  const errors = failed ? parseTscOutput(output) : [];
  return (
    <div className={`font-mono text-sm ${className}`}>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-sans text-xs">
        <span className="font-medium uppercase tracking-wider text-ink-muted">Type check</span>
        {!failed ? (
          <span className="inline-flex items-center gap-1.5 text-ink">
            <CompleteIcon className="size-3.5" />
            No type errors
          </span>
        ) : (
          <span className="text-ink">
            {errors.length === 1 ? "1 type error" : errors.length > 1 ? `${errors.length} type errors` : "It didn't pass"}
          </span>
        )}
      </p>
      {failed && (
        <ul className="mt-2 space-y-1.5">
          {errors.length === 0 && <li className="whitespace-pre-wrap text-danger">{output || "The type check failed."}</li>}
          {errors.map((d, i) => {
            const [first, ...more] = d.text.split("\n");
            const where = first.slice(0, first.indexOf(": ") + 1);
            const rest = first.slice(where.length);
            return (
              <li key={i} className="whitespace-pre-wrap text-danger">
                {inFile(d, fileName) && onGoTo ? (
                  <button
                    type="button"
                    onClick={() => onGoTo(d.line!, d.col!)}
                    title={`Go to line ${d.line}, column ${d.col}`}
                    className="text-left underline decoration-edge-strong underline-offset-2 transition-colors hover:decoration-ink"
                  >
                    {where}
                  </button>
                ) : (
                  where
                )}
                {rest}
                {more.length > 0 && `\n${more.join("\n")}`}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
