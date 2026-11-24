// Types for lib/lesson-math.mjs (plain JavaScript so the Node verifier can use it).
export const INLINE_MATH: string;

export const KATEX_OPTIONS: { output: "htmlAndMathml"; trust: false; strict: "ignore" };

export interface MathSpan {
  /** The TeX between the dollars. */
  tex: string;
  /** A $$ block of its own, typeset centered (displayMode). */
  display: boolean;
}

export function displayMath(block: string): string | null;
export function isTableSeparator(line: string): boolean;
export function tableCells(row: string, math?: boolean): string[];
export function mathSpans(md: string | null | undefined): { spans: MathSpan[]; loose: string[] };
export function stripMath(md: string | null | undefined, word?: string): string;
