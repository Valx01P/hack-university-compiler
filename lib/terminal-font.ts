/**
 * The terminal's font: the code font (the theme menu's, --font-code), the
 * first in its stack under a name of its own whose ascent and descent add up
 * to exactly 1em, ahead of the stack itself, so a row can be any line
 * spacing (the theme menu's) times the text size. xterm measures a row from
 * the font's ascent plus descent and won't go below it (its lineHeight is at
 * least 1), and a font's own add up to more than a tight terminal wants
 * (JetBrains Mono's 1.32em). The terminal measures what it got
 * (evenCells), so a font this can't make still works, from its own height.
 *
 * A bundled font (fontsource's JetBrains Mono) is made from the app's own
 * @font-face rules, one per subset with its unicode-range, so the same files
 * load, with its own metrics kept (ascent 1020 and descent 300 per 1000: the
 * baseline 0.36em below a row's middle). An installed one (Menlo, Comic
 * Sans) is found by its local names, its baseline 0.32em below the middle,
 * where most fonts sit.
 */

const GENERIC = new Set(["monospace", "ui-monospace", "cursive", "fantasy", "serif", "sans-serif", "system-ui", "ui-sans-serif", "ui-serif"]);

/** The named fonts in a font-family stack, in order. */
function families(stack: string): string[] {
  return stack
    .split(",")
    .map((f) => f.trim().replace(/^["']|["']$/g, ""))
    .filter((f) => f && !GENERIC.has(f.toLowerCase()));
}

const made = new Map<string, Promise<string | null>>();

/** The terminal's font-family for a code font stack. */
export async function terminalFamily(stack: string): Promise<string> {
  const first = families(stack)[0];
  if (!first || typeof FontFace === "undefined" || !document.fonts) return stack;
  let name = made.get(first);
  if (!name) {
    name = makeTight(first);
    made.set(first, name);
  }
  const tight = await name.catch(() => null);
  return tight ? `"${tight}", ${stack}` : stack;
}

/** A url() in a stylesheet's rule, resolved against the stylesheet: a face
    made here would look for it relative to the page. */
function absolute(src: string, base: string): string {
  return src.replace(/url\((["']?)([^"')]+)\1\)/g, (_, _q: string, url: string) => {
    try {
      return `url("${new URL(url, base).href}")`;
    } catch {
      return `url("${url}")`;
    }
  });
}

async function makeTight(first: string): Promise<string | null> {
  const name = `HU Terminal ${first}`;
  const faces: FontFace[] = [];
  const own = first === "JetBrains Mono Variable";
  const metrics = { ascentOverride: own ? "86%" : "82%", descentOverride: own ? "14%" : "18%", lineGapOverride: "0%", display: "block" as const };
  // Bundled: its @font-face rules.
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSFontFaceRule)) continue;
      const style = rule.style;
      if (style.getPropertyValue("font-family").replace(/["']/g, "").trim() !== first) continue;
      const src = absolute(style.getPropertyValue("src"), sheet.href ?? location.href);
      if (!src) continue;
      try {
        faces.push(
          new FontFace(name, src, {
            style: style.getPropertyValue("font-style") || "normal",
            weight: style.getPropertyValue("font-weight") || "normal",
            unicodeRange: style.getPropertyValue("unicode-range") || undefined,
            ...metrics,
          })
        );
      } catch {
        /* a rule this browser can't take */
      }
    }
  }
  // Installed: by the names it goes by (full and PostScript), plain and bold.
  if (!faces.length) {
    const ps = first.replace(/\s+/g, "");
    const local = (...names: string[]) => names.map((n) => `local("${n}")`).join(", ");
    faces.push(new FontFace(name, local(first, `${first} Regular`, ps, `${ps}-Regular`), { weight: "400", ...metrics }));
    faces.push(new FontFace(name, local(`${first} Bold`, `${ps}-Bold`), { weight: "700", ...metrics }));
  }
  for (const face of faces) document.fonts.add(face);
  await document.fonts.load(`13px "${name}"`).catch(() => []);
  return document.fonts.check(`13px "${name}"`) && faces.some((f) => f.status === "loaded") ? name : null;
}

let canvas: CanvasRenderingContext2D | null | undefined;

/**
 * xterm's lineHeight and letterSpacing for rows `spacing` times `size` px
 * tall in `family`, made so every cell is an even number of the screen's
 * pixels across and down. xterm draws half blocks and quadrants (a TUI's
 * logo, ▛ and ▜ in Claude Code's) as rectangles in eighths of a cell, and
 * where a half lands between two pixels both sides blend into it, leaving a
 * faint seam (at 110% zoom on a Retina screen, say). It measures cells the
 * way xterm does (its text-metrics measure of a "W", floored across and
 * rounded up down, in the screen's pixels), then adds one pixel across when
 * that's odd (letterSpacing is whole pixels added to a cell) and picks the
 * line height that floors to the nearest even height, never under the
 * font's own.
 */
export function evenCells(family: string, size: number, spacing: number): { lineHeight: number; letterSpacing: number } {
  canvas ??= document.createElement("canvas").getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  if (!canvas) return { lineHeight: Math.max(1, spacing / 1.32), letterSpacing: 0 };
  canvas.font = `${size}px ${family}`;
  const m = canvas.measureText("W");
  const width = Math.floor(m.width * dpr);
  const height = Math.ceil((m.fontBoundingBoxAscent + m.fontBoundingBoxDescent) * dpr);
  if (!(width > 0 && height > 0)) return { lineHeight: Math.max(1, spacing / 1.32), letterSpacing: 0 };
  let row = 2 * Math.round((spacing * size * dpr) / 2);
  row = Math.max(row, height + (height % 2));
  return { lineHeight: Math.max(1, (row + 0.5) / height), letterSpacing: width % 2 };
}
