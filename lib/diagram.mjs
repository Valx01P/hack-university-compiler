// Diagrams in read lessons: an SVG in content/learn/<course>/diagrams/,
// shown where a part's ```diagram <name> fence is. Plain JavaScript with no
// fs, so the app (lib/learn.ts, components/learn/diagram.tsx), the prebuild
// (scripts/build-content.mjs), and the verifier (scripts/verify-lessons.mjs)
// all read a file the same way.
//
// parseDiagram reads a strict subset of XML into a tree React can build
// element by element, so no SVG markup ever reaches the page as markup. It
// keeps only shapes, lines, and text with geometry and the `dg-` classes:
// the app's CSS colors them from the theme's tokens (app/globals.css), so a
// diagram follows every theme and contrast level and never names a color.
// The title and desc are lifted out of the tree. The renderer puts them in
// aria-label and a hidden description, never in a <title> element, which
// would show a tooltip the tooltip guard can't hide.
//
// content/learn/AUTHORING.md ("Read courses") is the guide for drawing one.

/** The SVG namespace the root must declare. */
const SVG_NS = "http://www.w3.org/2000/svg";

/** The most a diagram file may hold. */
export const DIAGRAM_LIMITS = {
  bytes: 32 * 1024,
  elements: 400,
  depth: 8,
  minWidth: 320,
  maxWidth: 720,
  minHeight: 120,
  maxHeight: 900,
  titleChars: 100,
  descWords: [15, 120],
};

const SHAPES = ["rect", "circle", "ellipse", "polygon", "path"];
const LINES = ["line", "polyline", "path"];
const TEXT = ["text", "tspan"];

/** Every class a diagram may use, and the elements it suits. */
export const DIAGRAM_CLASSES = {
  "dg-box": SHAPES,
  "dg-strong": SHAPES,
  "dg-hot": SHAPES,
  "dg-off": SHAPES,
  "dg-frame": SHAPES,
  "dg-badge": ["circle"],
  "dg-line": LINES,
  "dg-flow": LINES,
  "dg-dashed": LINES,
  "dg-heading": ["text"],
  "dg-note": TEXT,
  "dg-faint": TEXT,
  "dg-code": TEXT,
  "dg-on-hot": ["text"],
  "dg-on-badge": ["text"],
};

// A shape takes one of these (what it draws), a line one of the strokes
// (dg-dashed is added to it), and text at most one color and one face.
const SHAPE_CLASSES = ["dg-box", "dg-strong", "dg-hot", "dg-off", "dg-frame", "dg-badge"];
const STROKE_CLASSES = ["dg-line", "dg-flow"];
const TEXT_COLORS = ["dg-note", "dg-faint", "dg-on-hot", "dg-on-badge"];
const TEXT_FACES = ["dg-heading", "dg-code"];

/**
 * The markers the renderer defines in every diagram, each under its own id
 * (`dg-<name>-arrow`), so `url(#arrow)` in a file points at the diagram's
 * own. Sizes are in the diagram's units (markerUnits userSpaceOnUse), so a
 * head is the same size on every line. An arrow's tip sits a unit past the
 * line's end, over its round cap.
 */
export const MARKERS = [
  { id: "arrow", className: "dg-head", refX: 9, refY: 5, size: 10, shape: { tag: "path", attrs: { d: "M0 1 L10 5 L0 9 Z" } } },
  { id: "arrow-flow", className: "dg-head-flow", refX: 9, refY: 5, size: 10, shape: { tag: "path", attrs: { d: "M0 1 L10 5 L0 9 Z" } } },
  { id: "dot", className: "dg-head", refX: 5, refY: 5, size: 10, shape: { tag: "circle", attrs: { cx: "5", cy: "5", r: "3" } } },
];
const MARKER_END = new Set(["url(#arrow)", "url(#arrow-flow)"]);
const MARKER_START = new Set(["url(#dot)"]);

/** A file's attribute name to its React prop, where they differ. */
export const DIAGRAM_PROPS = {
  class: "className",
  "text-anchor": "textAnchor",
  "marker-end": "markerEnd",
  "marker-start": "markerStart",
};

const NUMBER = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;
const OFFSET = /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:em)?$/;
const PATH_DATA = /^\s*[Mm][MmLlHhVvCcSsQqTtAaZz0-9.,\-\s]*$/;
const POINTS = /^[0-9.,\-\s]+$/;
const TRANSFORM = /^\s*(?:(?:translate|rotate|scale)\(\s*-?[\d.]+(?:\s*[,\s]\s*-?[\d.]+){0,2}\s*\)\s*)+$/;

const check = {
  number: (v) => NUMBER.test(v),
  offset: (v) => OFFSET.test(v),
  d: (v) => PATH_DATA.test(v),
  points: (v) => POINTS.test(v),
  transform: (v) => TRANSFORM.test(v),
  anchor: (v) => v === "start" || v === "middle" || v === "end",
};
const ATTR_RULES = {
  x: check.number, y: check.number, width: check.number, height: check.number, rx: check.number, ry: check.number,
  cx: check.number, cy: check.number, r: check.number, x1: check.number, y1: check.number, x2: check.number, y2: check.number,
  dx: check.offset, dy: check.offset, d: check.d, points: check.points, transform: check.transform, "text-anchor": check.anchor,
};
const ATTR_HINT = {
  number: "a plain number",
  offset: "a number, or an em value like 0.35em",
  d: "path commands and numbers only",
  points: "numbers, commas, and spaces",
  transform: "translate, rotate, or scale",
  anchor: "start, middle, or end",
};
const hintFor = (name) =>
  name === "dx" || name === "dy" ? ATTR_HINT.offset
  : name === "d" ? ATTR_HINT.d
  : name === "points" ? ATTR_HINT.points
  : name === "transform" ? ATTR_HINT.transform
  : name === "text-anchor" ? ATTR_HINT.anchor
  : ATTR_HINT.number;

/** The attributes each element takes, beside `class` (and `transform` and
    the markers where they're listed). */
const GEOMETRY = {
  g: ["transform"],
  rect: ["x", "y", "width", "height", "rx", "ry", "transform"],
  circle: ["cx", "cy", "r", "transform"],
  ellipse: ["cx", "cy", "rx", "ry", "transform"],
  line: ["x1", "y1", "x2", "y2", "transform", "marker-end", "marker-start"],
  polyline: ["points", "transform", "marker-end", "marker-start"],
  polygon: ["points", "transform"],
  path: ["d", "transform", "marker-end", "marker-start"],
  text: ["x", "y", "dx", "dy", "text-anchor", "transform"],
  tspan: ["x", "y", "dx", "dy", "text-anchor"],
};
const ELEMENTS = new Set(Object.keys(GEOMETRY));
/** Elements SVG has that a diagram may not use, and why. */
const REFUSED = {
  defs: "the app adds the markers itself (url(#arrow), url(#arrow-flow), url(#dot))",
  marker: "the app adds the markers itself (url(#arrow), url(#arrow-flow), url(#dot))",
  use: "draw each shape where it goes",
  symbol: "draw each shape where it goes",
  a: "diagrams have no links",
  image: "diagrams have no images",
  style: "the app's classes color diagrams",
  script: "diagrams run nothing",
  foreignObject: "draw text with text and tspan",
  clipPath: "draw only what shows",
  mask: "draw only what shows",
  filter: "diagrams have no effects",
  linearGradient: "diagrams have no gradients",
  radialGradient: "diagrams have no gradients",
  pattern: "fills come from the classes",
  animate: "diagrams don't move",
  animateTransform: "diagrams don't move",
  animateMotion: "diagrams don't move",
  set: "diagrams don't move",
  switch: "diagrams show one thing",
  metadata: "export without editor metadata",
  svg: "one svg, at the root",
};
const TEXT_HOLDERS = new Set(["title", "desc", "text", "tspan"]);
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** Where a character offset is in the file, from 1. */
function lineCol(text, at) {
  let line = 1;
  let col = 1;
  for (let i = 0; i < at && i < text.length; i++) {
    if (text[i] === "\n") {
      line++;
      col = 1;
    } else col++;
  }
  return { line, col };
}

/**
 * Reads the XML subset: one root element, elements with quoted attributes
 * (no duplicates), text, comments (dropped), and an optional <?xml ...?>
 * at the very start. DOCTYPE, CDATA, processing instructions, namespace
 * prefixes, and entities other than the five XML ones and numeric ones are
 * errors. Returns the root as { tag, attrs, children, at } (at: the offset
 * of its `<`), or null with errors.
 */
function parseXml(src, errors) {
  let i = 0;
  const fail = (at, message) => {
    const { line, col } = lineCol(src, at);
    errors.push(`line ${line}, column ${col}: ${message}`);
  };
  const decode = (raw, at) => {
    let bad = false;
    const out = raw.replace(/&([^;\s&<]*);?/g, (whole, name, offset) => {
      if (!whole.endsWith(";")) {
        bad || fail(at + offset, `"&" starts an entity: write &amp; for a literal ampersand`);
        bad = true;
        return whole;
      }
      if (Object.hasOwn(ENTITIES, name)) return ENTITIES[name];
      const num = /^#(\d+)$/.exec(name) ?? /^#x([0-9a-fA-F]+)$/.exec(name);
      if (num) {
        const code = parseInt(num[1], name[1] === "x" ? 16 : 10);
        if (code > 0 && code <= 0x10ffff) return String.fromCodePoint(code);
      }
      bad || fail(at + offset, `unknown entity ${whole} (only &amp; &lt; &gt; &quot; &apos; and numeric ones)`);
      bad = true;
      return whole;
    });
    return out;
  };

  // The prolog: an optional declaration at offset 0, then comments.
  if (src.startsWith("<?xml")) {
    const end = src.indexOf("?>");
    if (end < 0) {
      fail(0, "unclosed <?xml declaration");
      return null;
    }
    i = end + 2;
  }
  const skipMisc = () => {
    for (;;) {
      while (i < src.length && /\s/.test(src[i])) i++;
      if (src.startsWith("<!--", i)) {
        const end = src.indexOf("-->", i + 4);
        if (end < 0) {
          fail(i, "unclosed comment");
          i = src.length;
          return false;
        }
        if (src.slice(i + 4, end).includes("--")) fail(i, `"--" inside a comment`);
        i = end + 3;
        continue;
      }
      return true;
    }
  };
  const refuseMarkup = () => {
    if (src.startsWith("<!DOCTYPE", i) || src.startsWith("<!doctype", i)) return fail(i, "no DOCTYPE"), true;
    if (src.startsWith("<![CDATA[", i)) return fail(i, "no CDATA sections (write &lt; and &amp; instead)"), true;
    if (src.startsWith("<?", i)) return fail(i, src.startsWith("<?xml", i) ? "<?xml ...?> only at the very start of the file" : "no processing instructions"), true;
    if (src.startsWith("<!", i)) return fail(i, "unsupported markup"), true;
    return false;
  };

  if (!skipMisc()) return null;
  if (refuseMarkup()) return null;
  if (src[i] !== "<") {
    fail(i, "expected the <svg> element");
    return null;
  }

  const NAME = /[A-Za-z_][\w.:-]*/y;
  const readName = () => {
    NAME.lastIndex = i;
    const m = NAME.exec(src);
    if (!m) return null;
    i += m[0].length;
    return m[0];
  };

  /** Reads one element at `<`, its children included. */
  const readElement = () => {
    const at = i;
    i++; // <
    const tag = readName();
    if (!tag) {
      fail(at, "expected an element name after <");
      return null;
    }
    if (tag.includes(":")) fail(at, `no namespace prefixes (<${tag}>)`);
    const attrs = {};
    const attrAt = {};
    for (;;) {
      const before = i;
      while (i < src.length && /\s/.test(src[i])) i++;
      if (src.startsWith("/>", i)) {
        i += 2;
        return { tag, attrs, attrAt, children: [], at };
      }
      if (src[i] === ">") {
        i++;
        break;
      }
      if (i >= src.length) {
        fail(at, `unclosed <${tag}> tag`);
        return null;
      }
      if (i === before) {
        fail(i, `expected a space before the next attribute of <${tag}>`);
        return null;
      }
      const nameAt = i;
      const name = readName();
      if (!name) {
        fail(i, `unexpected "${src[i]}" in <${tag}>`);
        return null;
      }
      while (/\s/.test(src[i] ?? "")) i++;
      if (src[i] !== "=") {
        fail(nameAt, `attribute ${name} needs a quoted value`);
        return null;
      }
      i++;
      while (/\s/.test(src[i] ?? "")) i++;
      const quote = src[i];
      if (quote !== '"' && quote !== "'") {
        fail(i, `attribute ${name}'s value must be in quotes`);
        return null;
      }
      const end = src.indexOf(quote, i + 1);
      if (end < 0) {
        fail(i, `unclosed value for ${name}`);
        return null;
      }
      const raw = src.slice(i + 1, end);
      if (raw.includes("<")) fail(i + 1 + raw.indexOf("<"), `"<" in the value of ${name} (write &lt;)`);
      if (Object.hasOwn(attrs, name)) fail(nameAt, `duplicate attribute ${name}`);
      attrs[name] = decode(raw, i + 1);
      attrAt[name] = nameAt;
      i = end + 1;
    }

    const children = [];
    for (;;) {
      const textAt = i;
      const lt = src.indexOf("<", i);
      const raw = src.slice(i, lt < 0 ? src.length : lt);
      if (raw) children.push({ text: decode(raw, textAt), at: textAt });
      if (lt < 0) {
        fail(at, `<${tag}> is never closed`);
        return null;
      }
      i = lt;
      if (src.startsWith("</", i)) {
        const closeAt = i;
        i += 2;
        const name = readName();
        while (/\s/.test(src[i] ?? "")) i++;
        if (src[i] !== ">") {
          fail(closeAt, "malformed closing tag");
          return null;
        }
        i++;
        if (name !== tag) {
          fail(closeAt, `</${name ?? ""}> closes <${tag}>`);
          return null;
        }
        return { tag, attrs, attrAt, children, at };
      }
      if (src.startsWith("<!--", i)) {
        const end = src.indexOf("-->", i + 4);
        if (end < 0) {
          fail(i, "unclosed comment");
          return null;
        }
        if (src.slice(i + 4, end).includes("--")) fail(i, `"--" inside a comment`);
        i = end + 3;
        continue;
      }
      if (refuseMarkup()) return null;
      const child = readElement();
      if (!child) return null;
      children.push(child);
    }
  };

  const root = readElement();
  if (!root) return null;
  if (!skipMisc()) return null;
  if (i < src.length) {
    if (!refuseMarkup()) fail(i, "nothing may follow the closing </svg>");
    return null;
  }
  return root;
}

/** Text as SVG lays it out: runs of white space become one space, and a run
    that holds a line break (indentation) goes when it touches a tag. */
function tidyText(children) {
  const out = [];
  children.forEach((c, k) => {
    if (typeof c !== "string") return out.push(c);
    let s = c.replace(/^\s*\n\s*/, "").replace(/\s*\n\s*$/, "");
    if (k === 0) s = s.replace(/^\s+/, "");
    if (k === children.length - 1) s = s.replace(/\s+$/, "");
    s = s.replace(/\s+/g, " ");
    if (s) out.push(s);
  });
  return out;
}

const words = (s) => s.split(/\s+/).filter(Boolean).length;

/**
 * Reads a diagram file. Returns { data, errors, warnings }: data is null
 * whenever there are errors. Errors say where (line and column) and what
 * the file has to change. `name` is the file's name without .svg, which
 * prefixes the ids the renderer gives its markers.
 */
export function parseDiagram(svgText, name = "diagram") {
  const errors = [];
  const warnings = [];
  const src = String(svgText).replace(/^﻿/, "");
  const bytes = new TextEncoder().encode(src).length;
  if (bytes > DIAGRAM_LIMITS.bytes) errors.push(`the file is ${(bytes / 1024).toFixed(1)} KB, at most ${DIAGRAM_LIMITS.bytes / 1024} KB`);
  const root = parseXml(src, errors);
  if (!root) return { data: null, errors, warnings };
  const at = (node, attr) => {
    const { line, col } = lineCol(src, attr ? (node.attrAt[attr] ?? node.at) : node.at);
    return `line ${line}, column ${col}`;
  };
  const err = (node, message, attr) => errors.push(`${at(node, attr)}: ${message}`);

  // The root: the namespace and a viewBox, nothing else.
  let width = 0;
  let height = 0;
  if (root.tag !== "svg") err(root, `the root must be <svg>, not <${root.tag}>`);
  for (const attr of Object.keys(root.attrs)) {
    if (attr === "xmlns") {
      if (root.attrs.xmlns !== SVG_NS) err(root, `xmlns must be "${SVG_NS}"`, attr);
    } else if (attr === "viewBox") {
      const m = /^0 0 (\d+) (\d+)$/.exec(root.attrs.viewBox);
      if (!m) err(root, 'viewBox must be "0 0 W H" with whole numbers', attr);
      else {
        width = Number(m[1]);
        height = Number(m[2]);
        const L = DIAGRAM_LIMITS;
        if (width < L.minWidth || width > L.maxWidth) err(root, `the width is ${width}, it must be ${L.minWidth} to ${L.maxWidth} (680 fits the lesson column)`, attr);
        if (height < L.minHeight || height > L.maxHeight) err(root, `the height is ${height}, it must be ${L.minHeight} to ${L.maxHeight}`, attr);
        if (width >= L.minWidth && width <= L.maxWidth && width !== 680) warnings.push(`${at(root, attr)}: a width of 680 is one unit to a pixel in the lesson column`);
        if (height % 20) warnings.push(`${at(root, attr)}: make the height a multiple of 20 (the grid)`);
      }
    } else if (attr === "width" || attr === "height") {
      err(root, `no ${attr} on <svg>: the viewBox sets the size`, attr);
    } else {
      err(root, `<svg> takes only xmlns and viewBox, not ${attr}`, attr);
    }
  }
  if (root.attrs.xmlns === undefined) err(root, `<svg> needs xmlns="${SVG_NS}"`);
  if (root.attrs.viewBox === undefined) err(root, `<svg> needs viewBox="0 0 680 H"`);

  // The title and desc come first, once each, as plain text.
  const kids = root.children.filter((c) => !("text" in c));
  for (const c of root.children) if ("text" in c && c.text.trim()) err({ at: c.at, attrAt: {} }, "text outside a title, desc, text, or tspan");
  const plain = (node) => {
    if (node.children.some((c) => !("text" in c))) err(node, `<${node.tag}> holds plain text only`);
    if (Object.keys(node.attrs).length) err(node, `<${node.tag}> takes no attributes`);
    return node.children.filter((c) => "text" in c).map((c) => c.text).join("").replace(/\s+/g, " ").trim();
  };
  let title = "";
  let desc = "";
  if (kids[0]?.tag === "title") title = plain(kids[0]);
  else err(kids[0] ?? root, "the first element inside <svg> must be <title>");
  if (kids[1]?.tag === "desc") desc = plain(kids[1]);
  else err(kids[1] ?? root, "the second element inside <svg> must be <desc>");
  if (kids[0]?.tag === "title") {
    if (!title) err(kids[0], "the title is empty");
    if (title.length > DIAGRAM_LIMITS.titleChars) err(kids[0], `the title is ${title.length} characters, at most ${DIAGRAM_LIMITS.titleChars}`);
  }
  if (kids[1]?.tag === "desc") {
    const n = words(desc);
    const [min, max] = DIAGRAM_LIMITS.descWords;
    if (n < min || n > max) err(kids[1], `the desc is ${n} word${n === 1 ? "" : "s"}, it must be ${min} to ${max}: tell the whole sequence, since screen readers don't read the labels`);
  }

  // Everything else: the allowed elements, attributes, and classes.
  let count = 1;
  const build = (node, depth, inText) => {
    count++;
    if (depth > DIAGRAM_LIMITS.depth) err(node, `nested ${depth} deep, at most ${DIAGRAM_LIMITS.depth}`);
    const tag = node.tag;
    if (tag === "title" || tag === "desc") {
      err(node, `only one <${tag}>, the ${tag === "title" ? "first" : "second"} element inside <svg>`);
      return null;
    }
    if (!ELEMENTS.has(tag)) {
      err(node, `no <${tag}>${REFUSED[tag] ? `: ${REFUSED[tag]}` : ` (use g, rect, circle, ellipse, line, polyline, polygon, path, text, and tspan)`}`);
      return null;
    }
    if (tag === "tspan" && !inText) err(node, "a <tspan> goes inside a <text>");
    if (tag !== "tspan" && inText) err(node, `no <${tag}> inside a <text>`);
    const attrs = {};
    for (const [attr, value] of Object.entries(node.attrs)) {
      if (attr === "class") {
        const tokens = value.trim().split(/\s+/).filter(Boolean);
        for (const t of tokens) {
          if (!Object.hasOwn(DIAGRAM_CLASSES, t)) err(node, `unknown class "${t}" (use the dg- classes in AUTHORING.md)`, attr);
          else if (!DIAGRAM_CLASSES[t].includes(tag)) err(node, `class "${t}" doesn't go on <${tag}> (only ${DIAGRAM_CLASSES[t].join(", ")})`, attr);
        }
        if (new Set(tokens).size !== tokens.length) err(node, "a class is listed twice", attr);
        const has = (list) => tokens.filter((t) => list.includes(t));
        if (has(SHAPE_CLASSES).length > 1) err(node, `one of ${SHAPE_CLASSES.join(", ")} at a time`, attr);
        if (has(STROKE_CLASSES).length > 1) err(node, "dg-line or dg-flow, not both", attr);
        if (tokens.includes("dg-dashed") && !has(STROKE_CLASSES).length) err(node, "dg-dashed goes with dg-line or dg-flow", attr);
        if (has(SHAPE_CLASSES).length && has([...STROKE_CLASSES, "dg-dashed"]).length) err(node, "a shape class and a line class don't mix", attr);
        if (has(TEXT_COLORS).length > 1) err(node, `one of ${TEXT_COLORS.join(", ")} at a time`, attr);
        if (has(TEXT_FACES).length > 1) err(node, "dg-heading or dg-code, not both", attr);
        attrs.class = tokens.join(" ");
        continue;
      }
      if (attr === "marker-end" || attr === "marker-start") {
        if (!GEOMETRY[tag].includes(attr)) {
          err(node, `no ${attr} on <${tag}>`, attr);
          continue;
        }
        const allowed = attr === "marker-end" ? MARKER_END : MARKER_START;
        if (!allowed.has(value)) err(node, `${attr} must be ${[...allowed].join(" or ")}`, attr);
        const flow = (node.attrs.class ?? "").split(/\s+/).includes("dg-flow");
        if (value === "url(#arrow-flow)" && !flow) err(node, "url(#arrow-flow) ends a dg-flow line", attr);
        if (value === "url(#arrow)" && flow) err(node, "a dg-flow line ends in url(#arrow-flow)", attr);
        attrs[attr] = value;
        continue;
      }
      if (attr === "id") err(node, "no ids: the app gives the markers theirs", attr);
      else if (attr === "style" || attr === "fill" || attr === "stroke" || attr === "opacity" || /^(fill|stroke)-/.test(attr) || attr === "color")
        err(node, `no ${attr}: the dg- classes color a diagram, so it follows the theme`, attr);
      else if (/^font/.test(attr) || attr === "letter-spacing") err(node, `no ${attr}: the app's fonts set the text`, attr);
      else if (/^on/i.test(attr)) err(node, `no event handlers (${attr})`, attr);
      else if (attr === "href" || /^xlink:/.test(attr)) err(node, `no links (${attr})`, attr);
      else if (/^xml(ns)?:/.test(attr) || attr === "xmlns") err(node, `no ${attr} here`, attr);
      else if (!GEOMETRY[tag].includes(attr)) err(node, `no ${attr} on <${tag}>${GEOMETRY[tag].length ? ` (it takes ${GEOMETRY[tag].join(", ")}, and class)` : ""}`, attr);
      else if (!ATTR_RULES[attr](value)) err(node, `${attr}="${value}" must be ${hintFor(attr)}`, attr);
      else attrs[attr] = value.trim();
    }
    const holdsText = TEXT_HOLDERS.has(tag);
    const children = [];
    for (const c of node.children) {
      if ("text" in c) {
        if (holdsText) children.push(c.text);
        else if (c.text.trim()) err({ at: c.at, attrAt: {} }, `text inside <${tag}> (labels go in a <text>)`);
        continue;
      }
      if (!holdsText && ["rect", "circle", "ellipse", "line", "polyline", "polygon", "path"].includes(tag)) {
        err(c, `<${tag}> holds nothing`);
        continue;
      }
      const built = build(c, depth + 1, tag === "text" || tag === "tspan");
      if (built) children.push(built);
    }
    return { tag, attrs, children: holdsText ? tidyText(children) : children };
  };
  const nodes = [];
  for (const [k, c] of kids.entries()) {
    if ((k === 0 && c.tag === "title") || (k === 1 && c.tag === "desc")) continue;
    const built = build(c, 2, false);
    if (built) nodes.push(built);
  }
  if (count > DIAGRAM_LIMITS.elements) errors.push(`${count} elements, at most ${DIAGRAM_LIMITS.elements}`);
  if (!nodes.length) err(root, "the diagram draws nothing");
  if (errors.length) return { data: null, errors, warnings };
  return { data: { name, title, desc, width, height, nodes }, errors, warnings };
}

/** The diagram names a Markdown field shows, in order: each
    ```diagram <name> fence's name, as written. */
export function diagramNames(md) {
  // Fences split the way lib/snippet-harness.mjs splits them, so the two
  // always agree on what a fence is.
  const names = [];
  String(md ?? "").split(/^```/m).forEach((part, i) => {
    if (i % 2 === 0) return;
    const nl = part.indexOf("\n");
    const [first = "", name = ""] = (nl < 0 ? part : part.slice(0, nl)).trim().split(/\s+/);
    if (first.toLowerCase() === "diagram") names.push(name);
  });
  return names;
}
