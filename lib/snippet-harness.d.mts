// Types for lib/snippet-harness.mjs (plain JavaScript so the Node checker can use it).
/** The course a snippet runs through, as /api/execute names it. */
export type SnippetRuntime = "python" | "javascript" | "typescript" | "cpp" | "java" | "go" | "sql" | "bash";

export type MarkdownSegment =
  | { type: "lines"; content: string }
  | {
      type: "fence";
      /** The fence's first word, lowercased ("text" when there is none). */
      language: string;
      content: string;
      /** Where it runs, or null when it doesn't (text, norun, a fence its
          course doesn't run). */
      runtime: SnippetRuntime | null;
      /** Meant to fail: it shows an error. */
      expectError: boolean;
      harness: string | null;
      stdin: string | null;
    };

export function fenceRuntime(language: string, course: string | null | undefined): SnippetRuntime | null;
export function segmentMarkdown(md: string, course?: string | null): MarkdownSegment[];
export function buildProgram(runtime: SnippetRuntime, code: string, harness?: string | null): string;
export function applyHarness(harness: string, code: string): string;
