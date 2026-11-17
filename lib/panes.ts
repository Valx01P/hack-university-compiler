/**
 * Where you left each draggable border, saved in this browser
 * (hu-pane-<name>). Each one is a CSS variable on <html> (--hu-<name>), set
 * before first paint by the bootstrap in app/layout.tsx, which is built from
 * this table (PANE_BOOTSTRAP) so the two never drift, and the layouts read
 * the variable with the default as its fallback (paneValue), so a reload
 * opens at your sizes with nothing shifting. lib/pane-size.ts saves and reads
 * them. Plain data, no React: the server layout imports it.
 */

export interface Pane {
  unit: "px" | "%" | "";
  min: number;
  max: number;
  initial: number;
  /** The size that folds a pane away (past the range, or its end), and the
      attribute set on <html> while it's there, so CSS lays the fold out from
      first paint. */
  fold?: { at: number; attr: string };
}

export const PANES = {
  // Learn: the lesson list's width (0 folded away, which also marks
  // <html data-learn-list-folded>), and the width it opens at again.
  "learn-list": { unit: "px", min: 0, max: 440, initial: 256, fold: { at: 0, attr: "data-learn-list-folded" } },
  "learn-list-open": { unit: "px", min: 208, max: 440, initial: 256 },
  // Learn: the lesson beside the editor, and the code box over the output
  // (a flex weight out of 100, the output getting the rest, and all of it at
  // 100, the output folded away).
  "learn-split": { unit: "%", min: 30, max: 70, initial: 50 },
  "learn-editor": { unit: "", min: 30, max: 80, initial: 60, fold: { at: 100, attr: "data-learn-output-folded" } },
  // Learn: the lesson beside a project part's IDE.
  "learn-ide-split": { unit: "%", min: 25, max: 70, initial: 38 },
  // The compiler: the editor beside the output, the editor over it (stacked,
  // as it is while the cheatsheet or challenges panel is open, and 100 with
  // the output folded away), each kept on its own, and both of them beside
  // the panel.
  "compiler-split": { unit: "%", min: 20, max: 80, initial: 55 },
  "compiler-stack": { unit: "%", min: 20, max: 80, initial: 55, fold: { at: 100, attr: "data-compiler-output-folded" } },
  "compiler-ref": { unit: "%", min: 30, max: 75, initial: 55 },
  // The IDE: the explorer's width, the dock's height, and the preview's width.
  "ide-explorer": { unit: "px", min: 160, max: 360, initial: 208 },
  "ide-dock": { unit: "%", min: 15, max: 85, initial: 32 },
  "ide-preview": { unit: "%", min: 20, max: 75, initial: 40 },
} as const satisfies Record<string, Pane>;

export type PaneName = keyof typeof PANES;

export const paneKey = (name: PaneName) => `hu-pane-${name}`;
export const paneVar = (name: PaneName) => `--hu-${name}`;

/** A pane's size for CSS: the saved one, else its default. */
export function paneValue(name: PaneName): string {
  const p = PANES[name];
  return `var(${paneVar(name)}, ${p.initial}${p.unit})`;
}

/** A pane's fold, if it has one. */
export const foldOf = (name: PaneName) => (PANES[name] as Pane).fold;

/** The bootstrap's part (it runs with `d` as <html>): every saved size that's
    a whole number in its range, or its fold, becomes its variable, and a
    fold marks <html> too. */
export const PANE_BOOTSTRAP = `var P=${JSON.stringify(
  Object.fromEntries(
    Object.entries(PANES).map(([name, p]: [string, Pane]) => [name, [p.unit, p.min, p.max, p.fold?.at ?? -1, p.fold?.attr ?? ""]])
  )
)};for(var k in P){var p=P[k],v=localStorage.getItem("hu-pane-"+k);if(v!==null&&/^\\d{1,4}$/.test(v)&&(+v>=p[1]&&+v<=p[2]||+v===p[3])){d.style.setProperty("--hu-"+k,v+p[0]);if(p[4]&&+v===p[3])d.setAttribute(p[4],"")}}`;
