import katex from "katex";
import { KATEX_OPTIONS } from "@/lib/lesson-math.mjs";

/**
 * TeX as KaTeX's markup: its HTML for the eye, beside MathML for screen
 * readers (lib/lesson-math.mjs's options). It's only imported by a part
 * that typesets (components/learn/part-view.tsx hands it to the prose of a
 * course with "math": true), so KaTeX loads with Learn's parts and nowhere
 * else. A span that doesn't parse shows as its TeX instead of failing the
 * page, which the verifier never lets ship.
 */
export function typeset(tex: string, display: boolean): string {
  return katex.renderToString(tex, { ...KATEX_OPTIONS, displayMode: display, throwOnError: false });
}
