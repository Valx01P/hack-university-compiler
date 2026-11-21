/**
 * Colors in OKLCH (lightness, chroma, hue), for the terminal's colors
 * (components/ide/terminal-view.tsx): more or less vivid by scaling chroma,
 * and raised to a contrast against the background by changing lightness
 * alone, so a color keeps its hue and strength instead of washing out toward
 * white (xterm's own minimum contrast blends toward white, which turns a
 * palette pastel). Results are fitted into sRGB by lowering chroma only.
 * Also the plain WCAG contrast and sRGB mix the theme menu's warnings and
 * the terminal's dim text use.
 */

type Lch = [l: number, c: number, h: number];

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function parse(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => toLinear(v / 255)) as [number, number, number];
}

function toLch([r, g, b]: [number, number, number]): Lch {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), Math.atan2(B, A)];
}

function toLinearRgb([L, C, h]: Lch): [number, number, number] {
  const A = C * Math.cos(h);
  const B = C * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (rgb: number[]) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

/** The color, its chroma lowered until it fits sRGB, in linear RGB. */
function fit([L, C, h]: Lch): [number, number, number] {
  const l = Math.min(1, Math.max(0, L));
  let rgb = toLinearRgb([l, C, h]);
  if (inGamut(rgb)) return rgb;
  let lo = 0;
  let hi = C;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(toLinearRgb([l, mid, h]))) lo = mid;
    else hi = mid;
  }
  rgb = toLinearRgb([l, lo, h]);
  return rgb;
}

function hex(rgb: [number, number, number]): string {
  return `#${rgb
    .map((v) => Math.round(Math.min(1, Math.max(0, toGamma(Math.min(1, Math.max(0, v))))) * 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

const luminanceOf = ([r, g, b]: [number, number, number]) =>
  0.2126 * Math.min(1, Math.max(0, r)) + 0.7152 * Math.min(1, Math.max(0, g)) + 0.0722 * Math.min(1, Math.max(0, b));
const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** The WCAG contrast of two #rrggbb colors, Infinity when one can't be
    read (nothing to warn about). */
export function contrast(a: string, b: string): number {
  const x = parse(a);
  const y = parse(b);
  return x && y ? ratio(luminanceOf(x), luminanceOf(y)) : Infinity;
}

/** `top` laid over `bottom` at `amount` (0 to 1), as #rrggbb: the mix a
    browser draws, channel by channel in sRGB. */
export function mix(top: string, bottom: string, amount: number): string {
  const channels = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  const [t, b] = [channels(top), channels(bottom)];
  return `#${t.map((v, i) => Math.round(v * amount + b[i] * (1 - amount)).toString(16).padStart(2, "0")).join("")}`;
}

/** Whether light text goes on it: the same line withContrast draws. */
export function isDark(color: string): boolean {
  const rgb = parse(color);
  return rgb ? luminanceOf(rgb) < 0.18 : true;
}

/** The color with its chroma times `scale` (1 leaves it), as #rrggbb. */
export function scaleChroma(color: string, scale: number): string {
  const rgb = parse(color);
  if (!rgb || scale === 1) return color;
  const [L, C, h] = toLch(rgb);
  return hex(fit([L, C * scale, h]));
}

/** The color at least `min`:1 against `background`, by lightness alone
    (lighter on a dark background, darker on a light one), as #rrggbb. */
export function withContrast(color: string, background: string, min: number): string {
  const rgb = parse(color);
  const bg = parse(background);
  if (!rgb || !bg || min <= 1) return color;
  const bgLum = luminanceOf(bg);
  if (ratio(luminanceOf(rgb), bgLum) >= min) return color;
  const [L, C, h] = toLch(rgb);
  const lighter = isDark(background);
  const at = (l: number) => ratio(luminanceOf(fit([l, C, h])), bgLum);
  // As far as it can go, if even that isn't enough.
  const end = lighter ? 1 : 0;
  if (at(end) < min) return hex(fit([end, C, h]));
  let near = L;
  let far = end;
  for (let i = 0; i < 24; i++) {
    const mid = (near + far) / 2;
    if (at(mid) >= min) far = mid;
    else near = mid;
  }
  return hex(fit([far, C, h]));
}
