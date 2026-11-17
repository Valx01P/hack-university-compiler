/** The program's input under an editor or at the top of its output (stdin,
    the Arguments field), in the compiler and Learn. */

/** The rounding of the program input rows' focus rings (stdin's toggle, the
    Arguments field) at their box's corners, since the box clips what's
    outside them. Under the editor the rows are the code box's last ones, so
    only their bottom corners round, and only once nothing's open under them.
    In the output (stacked, components/compiler/compiler-app.tsx and
    components/learn/part-view.tsx) they're a box of their own, the first row
    rounding at the top too. Written out whole, for Tailwind. */
const CORNERS = {
  editor: {
    alone: { whole: "rounded-b-[calc(var(--radius-card)-1px)]", left: "rounded-bl-[calc(var(--radius-card)-1px)]", right: "rounded-br-[calc(var(--radius-card)-1px)]" },
    above: { whole: "", left: "", right: "" },
  },
  output: {
    alone: { whole: "rounded-[calc(var(--radius-card)-1px)]", left: "rounded-l-[calc(var(--radius-card)-1px)]", right: "rounded-r-[calc(var(--radius-card)-1px)]" },
    above: { whole: "rounded-t-[calc(var(--radius-card)-1px)]", left: "rounded-tl-[calc(var(--radius-card)-1px)]", right: "rounded-tr-[calc(var(--radius-card)-1px)]" },
  },
} as const;

export type InputPlace = keyof typeof CORNERS;

/** The first row's corners: `alone` when nothing's open under it, and the
    part of the row (the whole of it, or the left or right half beside the
    Arguments field). */
export function inputCorners(place: InputPlace, alone: boolean, part: "whole" | "left" | "right"): string {
  return CORNERS[place][alone ? "alone" : "above"][part];
}
