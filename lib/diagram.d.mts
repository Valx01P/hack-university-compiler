// Types for lib/diagram.mjs (plain JavaScript so the prebuild and the
// verifier can use it).

/** One element of a diagram, its attributes as the file names them
    (`class`, `text-anchor`, `marker-end`). Text holds its strings. */
export interface DiagramNode {
  tag: "g" | "rect" | "circle" | "ellipse" | "line" | "polyline" | "polygon" | "path" | "text" | "tspan";
  attrs: Record<string, string>;
  children: (DiagramNode | string)[];
}

/** A diagram as the page draws it: its tree, with the title and desc
    lifted out for aria-label and the hidden description. */
export interface DiagramData {
  /** The file's name without .svg, which prefixes the marker ids. */
  name: string;
  title: string;
  desc: string;
  /** The viewBox's width and height, in units (a pixel each at 680 wide
      in the lesson column). */
  width: number;
  height: number;
  nodes: DiagramNode[];
}

export interface DiagramMarker {
  id: "arrow" | "arrow-flow" | "dot";
  className: string;
  refX: number;
  refY: number;
  size: number;
  shape: { tag: "path" | "circle"; attrs: Record<string, string> };
}

export const DIAGRAM_LIMITS: {
  bytes: number;
  elements: number;
  depth: number;
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
  titleChars: number;
  descWords: [number, number];
};
export const DIAGRAM_CLASSES: Record<string, string[]>;
export const MARKERS: DiagramMarker[];
export const DIAGRAM_PROPS: Record<string, string>;

/** Reads a diagram file: data is null whenever there are errors. */
export function parseDiagram(
  svgText: string,
  name?: string
): { data: DiagramData | null; errors: string[]; warnings: string[] };
/** The names a Markdown field's ```diagram fences show, in order. */
export function diagramNames(md: string | null | undefined): string[];
