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
  // <html data-learn-list-folded>), and the width it opens at again. Open,
  // it's 215px to 300px (the owner's call): wider only took room from the
  // lesson, and narrower squeezed the lesson titles.
  "learn-list": { unit: "px", min: 0, max: 300, initial: 256, fold: { at: 0, attr: "data-learn-list-folded" } },
  "learn-list-open": { unit: "px", min: 215, max: 300, initial: 256 },
  // Learn: the lesson beside the editor (its share out of 100 of the width
  // the border leaves, and all of it at 100: the editor folded away, by a
  // drag well past the lesson's widest or the bar's button, which also marks
  // <html data-learn-editor-folded>), the share it opens at again, and the
  // code box over the output (a flex weight out of 100, the output getting
  // the rest, and all of it at 100, the output folded away).
  "learn-split": { unit: "", min: 30, max: 70, initial: 50, fold: { at: 100, attr: "data-learn-editor-folded" } },
  "learn-split-open": { unit: "", min: 30, max: 70, initial: 50 },
  "learn-editor": { unit: "", min: 30, max: 80, initial: 60, fold: { at: 100, attr: "data-learn-output-folded" } },
  // The compiler: the editor's width, beside the output or beside the panel
  // (one width, so opening or closing the panel never moves the editor's
  // border, the panel keeping it within its own range, REF in
  // compiler-app.tsx), and the editor over the output (stacked, as it is
  // while the panel is open, and 100 with the output folded away), kept on
  // its own.
  "compiler-split": { unit: "%", min: 20, max: 80, initial: 55 },
  "compiler-stack": { unit: "%", min: 20, max: 80, initial: 55, fold: { at: 100, attr: "data-compiler-output-folded" } },
  // The playground: the Explorer's width (0 folded away, Mod+B or a drag
  // well past its narrowest, which also marks <html
  // data-playground-explorer-folded>) and the width it opens at again, and
  // the terminal's height under the editor (0 folded down to its bar, which
  // marks <html data-playground-terminal-folded>) and the height it opens at
  // again.
  "playground-explorer": { unit: "px", min: 160, max: 480, initial: 240, fold: { at: 0, attr: "data-playground-explorer-folded" } },
  "playground-explorer-open": { unit: "px", min: 160, max: 480, initial: 240 },
  "playground-terminal": { unit: "%", min: 15, max: 85, initial: 35, fold: { at: 0, attr: "data-playground-terminal-folded" } },
  "playground-terminal-open": { unit: "%", min: 15, max: 85, initial: 35 },
} as const satisfies Record<string, Pane>;

export type PaneName = keyof typeof PANES;

/** What Learn's bar's button fires to fold the editor away or open it again
    (components/learn/learn-shell.tsx), heard by the part on the page, which
    slides its border (components/learn/part-view.tsx). */
export const LEARN_EDITOR_TOGGLE = "hu:learn-editor-toggle";

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
    a number in its range (two decimals at most), or its fold, becomes its
    variable, and a fold marks <html> too. */
export const PANE_BOOTSTRAP = `var P=${JSON.stringify(
  Object.fromEntries(
    Object.entries(PANES).map(([name, p]: [string, Pane]) => [name, [p.unit, p.min, p.max, p.fold?.at ?? -1, p.fold?.attr ?? ""]])
  )
)};for(var k in P){var p=P[k],v=localStorage.getItem("hu-pane-"+k);if(v!==null&&/^\\d{1,4}(\\.\\d{1,2})?$/.test(v)&&(+v>=p[1]&&+v<=p[2]||+v===p[3])){d.style.setProperty("--hu-"+k,v+p[0]);if(p[4]&&+v===p[3])d.setAttribute(p[4],"")}}`;
