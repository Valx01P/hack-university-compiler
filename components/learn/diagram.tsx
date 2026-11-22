"use client";

import { createElement, useEffect, useRef, useState, type ReactNode } from "react";
import { DIAGRAM_PROPS, MARKERS, type DiagramData, type DiagramNode } from "@/lib/diagram.mjs";

/**
 * A read lesson's diagram, drawn inline from the tree lib/diagram.mjs read
 * out of its SVG, one React element at a time and only from the allowlist,
 * so no markup from the file ever reaches the page as markup. The app's CSS
 * colors it (the dg- classes in globals.css), so it follows the page's theme
 * and contrast level, never the code theme, and with no background of its
 * own the stars show through.
 *
 * It's one unit to a pixel at 680 wide, the lesson column's width, never
 * larger, and never under about 70% (labels stay 10px or more): narrower
 * than that, it scrolls sideways, joining the tab order while it does, and
 * the side with more to see fades out (a mask, no fill), since the
 * scrollbars are hidden by default and a cut-off box alone can look whole. The
 * title is its aria-label and the desc its description. Never a <title>
 * element or a title attribute: either would show a tooltip on hover, and
 * Hide tooltips can't reach the element.
 */

const TAGS = new Set(["g", "rect", "circle", "ellipse", "line", "polyline", "polygon", "path", "text", "tspan"]);
const ATTRS = new Set([
  "class", "x", "y", "width", "height", "rx", "ry", "cx", "cy", "r", "x1", "y1", "x2", "y2", "dx", "dy",
  "d", "points", "transform", "text-anchor", "marker-end", "marker-start",
]);
const MARKER_REF = /^url\(#(arrow|arrow-flow|dot)\)$/;

function draw(node: DiagramNode | string, key: number, prefix: string): ReactNode {
  if (typeof node === "string") return node;
  if (!TAGS.has(node.tag)) return null;
  const props: Record<string, string | number> = { key };
  for (const [attr, value] of Object.entries(node.attrs)) {
    if (!ATTRS.has(attr)) continue;
    if (attr === "marker-end" || attr === "marker-start") {
      const m = MARKER_REF.exec(value);
      if (!m) continue;
      props[DIAGRAM_PROPS[attr]] = `url(#${prefix}${m[1]})`;
      continue;
    }
    props[DIAGRAM_PROPS[attr] ?? attr] = value;
  }
  return createElement(node.tag, props, ...node.children.map((c, i) => draw(c, i, prefix)));
}

export function Diagram({ data, caption }: { data: DiagramData; caption?: ReactNode }) {
  const prefix = `dg-${data.name}-`;
  const { width: w, height: h } = data;
  // Scrolls (and takes focus, so the keyboard can scroll it) only while it
  // doesn't fit, as code blocks do.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  // Which sides have more to scroll to.
  const [more, setMore] = useState({ start: false, end: false });
  const measure = () => {
    const el = scrollRef.current;
    if (!el) return;
    const over = el.scrollWidth > el.clientWidth + 1;
    setOverflows(over);
    const start = over && el.scrollLeft > 1;
    const end = over && el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setMore((m) => (m.start === start && m.end === end ? m : { start, end }));
  };
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
    // measure only reads the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const edge = (fades: boolean) => (fades ? "transparent" : "black");
  const mask = overflows ? `linear-gradient(to right, ${edge(more.start)}, black 2.5rem, black calc(100% - 2.5rem), ${edge(more.end)})` : undefined;

  return (
    <figure className="my-6">
      <div
        ref={scrollRef}
        onScroll={measure}
        style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
        tabIndex={overflows ? 0 : undefined}
        role={overflows ? "region" : undefined}
        aria-label={overflows ? data.title : undefined}
        className="slim-scroll overflow-x-auto"
      >
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="diagram mx-auto block"
          role="img"
          aria-label={data.title}
          aria-describedby={`${prefix}desc`}
          focusable="false"
          style={{ width: "100%", height: "auto", aspectRatio: `${w} / ${h}`, maxWidth: w, minWidth: `min(${w}px, 30rem)` }}
        >
          <defs>
            {MARKERS.map((m) => (
              <marker
                key={m.id}
                id={`${prefix}${m.id}`}
                viewBox={`0 0 ${m.size} ${m.size}`}
                refX={m.refX}
                refY={m.refY}
                markerWidth={m.size}
                markerHeight={m.size}
                markerUnits="userSpaceOnUse"
                orient="auto"
              >
                {createElement(m.shape.tag, { ...m.shape.attrs, className: m.className })}
              </marker>
            ))}
          </defs>
          {data.nodes.map((n, i) => draw(n, i, prefix))}
        </svg>
      </div>
      <p id={`${prefix}desc`} className="sr-only">
        {data.desc}
      </p>
      {caption ? <figcaption className="mt-2 text-sm text-ink-muted">{caption}</figcaption> : null}
    </figure>
  );
}
