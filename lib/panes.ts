/**
 * Where you left each draggable border, saved in this browser
 * (hu-pane-<name>). Each one is a CSS variable on <html> (--hu-<name>), set
 * before first paint by the bootstrap in app/layout.tsx, which is built from
 * this table (PANE_BOOTSTRAP) so the two never drift, and the layouts read
 * the variable with the default as its fallback (paneValue), so a reload
 * opens at your sizes with nothing shifting. lib/pane-size.ts saves and reads
 * them. Plain data, no React: the server layout imports it.
 */

interface Pane {
  unit: "px" | "%" | "";
  min: number;
  max: number;
  initial: number;
  /** Set on <html> while the size is 0. */
  zeroAttr?: string;
}

export const PANES = {
  // Learn: the lesson list's width (0 folded away, which also marks
  // <html data-learn-list-folded>), and the width it opens at again.
  "learn-list": { unit: "px", min: 0, max: 440, initial: 256, zeroAttr: "data-learn-list-folded" },
  "learn-list-open": { unit: "px", min: 208, max: 440, initial: 256 },
  // Learn: the lesson beside the editor, and the code box over the output
  // (a flex weight out of 100, the output getting the rest).
  "learn-split": { unit: "%", min: 30, max: 70, initial: 50 },
  "learn-editor": { unit: "", min: 30, max: 80, initial: 60 },
  // Learn: the lesson beside a project part's IDE.
  "learn-ide-split": { unit: "%", min: 25, max: 70, initial: 38 },
  // The compiler: the editor beside (or over) the output, and both of them
  // beside the cheatsheet or challenges panel.
  "compiler-split": { unit: "%", min: 20, max: 80, initial: 55 },
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

/** The bootstrap's part (it runs with `d` as <html>): every saved size that's
    a whole number in its range becomes its variable. */
export const PANE_BOOTSTRAP = `var P=${JSON.stringify(
  Object.fromEntries(
    Object.entries(PANES).map(([name, p]: [string, Pane]) => [name, [p.unit, p.min, p.max, p.zeroAttr ?? ""]])
  )
)};for(var k in P){var p=P[k],v=localStorage.getItem("hu-pane-"+k);if(v!==null&&/^\\d{1,4}$/.test(v)&&+v>=p[1]&&+v<=p[2]){d.style.setProperty("--hu-"+k,v+p[0]);if(p[3]&&+v===0)d.setAttribute(p[3],"")}}`;
