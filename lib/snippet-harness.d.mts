// Types for lib/snippet-harness.mjs (plain JavaScript so the Node checker can use it).
export type SnippetRuntime = "python" | "javascript" | "cpp" | "java" | "go" | "sql";

export const RUNTIMES: Record<string, SnippetRuntime>;

export type MarkdownSegment =
  | { type: "lines"; content: string }
  | {
      type: "fence";
      /** The fence's first word, lowercased ("text" when there is none). */
      language: string;
      content: string;
      /** Where it runs, or null when it doesn't (text, norun). */
      runtime: SnippetRuntime | null;
      /** Meant to fail: it shows an error. */
      expectError: boolean;
      harness: string | null;
      stdin: string | null;
    };

export function segmentMarkdown(md: string): MarkdownSegment[];
export function buildProgram(runtime: SnippetRuntime, code: string, harness?: string | null): string;
export function applyHarness(harness: string, code: string): string;
