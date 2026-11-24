import React, { createContext, useContext } from "react";
import { Highlight } from "@/lib/highlight";
import { CopyableCodeBlock } from "@/components/ui/copyable-code-block";
import { Diagram } from "@/components/learn/diagram";
import { RunnableSnippet } from "@/components/learn/runnable-snippet";
import type { DiagramData } from "@/lib/diagram.mjs";
import { INLINE_MATH, displayMath, isTableSeparator, tableCells } from "@/lib/lesson-math.mjs";
import { segmentMarkdown } from "@/lib/snippet-harness.mjs";
import { snippetHash } from "@/lib/snippet-edits";

/**
 * Renderer for the content-markdown subset:
 * # ## ### headings, paragraphs, **bold**, *em*, `code`, ```fences,
 * [links](url), - lists, 1. lists, > blockquotes, | pipe | tables |, and in
 * a course that turns math on, $TeX$ and $$ blocks (lib/lesson-math.mjs).
 * No raw HTML passthrough.
 */

/** Typesets TeX into KaTeX's markup, inline or as display math. */
export type Typeset = (tex: string, display: boolean) => string;

/**
 * How the prose under it typesets math: null (the default) where a $ is
 * just a dollar, and lib/typeset.ts in a course with "math": true, which
 * PartView sets around the whole part, so every field gets it (the intro,
 * the body, the examples, the practice and its hints, the recap, and table
 * cells). A diagram's caption stays plain text. KaTeX itself comes only
 * with it.
 */
export const LessonMath = createContext<Typeset | null>(null);

/** Only allow safe link targets; anything else renders as plain text so a
    crafted `javascript:`/`data:` URL can never become a clickable link. */
function safeHref(url: string): string | null {
  const u = url.trim();
  if (/^(https?:\/\/|mailto:|\/|#)/i.test(u)) return u;
  return null;
}

/** A power written in digits, base^exponent (10^9, 2^31), drawn with its
    exponent raised: limits like 1 <= n <= 10^9 read at a glance, where
    1000000000 has to be counted. Never inside a word or a longer chain. */
const POWER = /(?<![\w^])(\d+)\^(\d+)(?![\w^])/g;

function powers(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(POWER)) {
    const idx = m.index ?? 0;
    out.push(text.slice(last, idx) + m[1]);
    out.push(<sup key={`${keyBase}-pow-${i++}`}>{m[2]}</sup>);
    last = idx + m[0].length;
  }
  if (!out.length) return [text];
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Inline code that's a bound, like `0 <= k <= 10^9`: a comparison of
    numbers and names, so its powers are raised too. Any other code keeps
    its ^ as typed (`2^40 = ` is text a program prints, and ^ is XOR in
    most languages). */
const BOUND = /^(?=.*[<>])[\w\s.,+\-−×*()<>=^]+$/;

// Inline tokens: \*, [text](url), `code`, **bold**, *em*. A \* is a
// literal star, so a name like A* search can sit in bold or italics.
const TOKENS = /(\\\*)|(\[[^\]]+\]\([^)\s]+\))|(`[^`]+`)|(\*\*(?:\\\*|[^*])+\*\*)|(\*(?:\\\*|[^*\n])+\*)/g;
// With math on, \$ (a dollar) and $TeX$ too, and bold and italics hold a
// span whole, so a star in its TeX ($a*b$) never closes them. Math is a
// token of its own, so the powers below never see TeX.
const M = INLINE_MATH;
const MATH_TOKENS = new RegExp(
  String.raw`(\\\*)|(\\\$)|(${M})|(\[[^\]]+\]\([^)\s]+\))|(\`[^\`]+\`)|(\*\*(?:${M}|\\\*|(?!${M})[^*])+\*\*)|(\*(?:${M}|\\\*|(?!${M})[^*\n])+\*)`,
  "g"
);

function inline(text: string, keyBase: string, tex: Typeset | null = null): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(tex ? MATH_TOKENS : TOKENS)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(...powers(text.slice(last, idx), `${keyBase}-t${i}`));
    const tok = m[0];
    const key = `${keyBase}-${i++}`;
    if (tok === "\\*") {
      out.push("*");
    } else if (tok === "\\$") {
      out.push("$");
    } else if (tex && tok.startsWith("$")) {
      // KaTeX's own markup for the lesson's own TeX: KaTeX escapes every
      // character of text it prints, and with trust off it makes no link,
      // class, or style out of the TeX, so no markup from content gets in.
      out.push(<span key={key} className="math" dangerouslySetInnerHTML={{ __html: tex(tok.slice(1, -1), false) }} />);
    } else if (tok.startsWith("[")) {
      const close = tok.indexOf("](");
      const label = tok.slice(1, close);
      const href = safeHref(tok.slice(close + 2, -1));
      if (href) {
        const external = /^https?:\/\//i.test(href);
        out.push(
          <a
            key={key}
            href={href}
            {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}
            className="font-medium text-ink underline decoration-edge-strong underline-offset-2 transition-colors hover:decoration-ink"
          >
            {label}
          </a>
        );
      } else {
        out.push(label);
      }
    } else if (tok.startsWith("`")) {
      out.push(
        <code
          key={key}
          className="rounded border border-content-line bg-raised px-1.5 py-0.5 font-mono text-[0.85em] font-medium text-ink"
        >
          {BOUND.test(tok.slice(1, -1)) ? powers(tok.slice(1, -1), key) : tok.slice(1, -1)}
        </code>
      );
    } else if (tok.startsWith("**")) {
      out.push(<strong key={key}>{inline(tok.slice(2, -2), `${key}-strong`, tex)}</strong>);
    } else {
      out.push(<em key={key}>{inline(tok.slice(1, -1), `${key}-em`, tex)}</em>);
    }
    last = idx + tok.length;
  }
  if (last < text.length) out.push(...powers(text.slice(last), `${keyBase}-end`));
  return out;
}

// A table's separator row and its cells (an escaped `\|`, like SQL's `||`,
// is a literal pipe in a cell, never a column, and with math on so is a
// pipe in a cell's TeX) come from lib/lesson-math.mjs, which finds a cell's
// math the same way.

type Align = "left" | "center" | "right";
const alignClass: Record<Align, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

function renderTable(lines: string[], key: string, tex: Typeset | null): React.ReactNode {
  // With math on, a cell's TeX keeps its own pipes ($|x|$).
  const headers = tableCells(lines[0], Boolean(tex));
  const aligns: Align[] = tableCells(lines[1]).map((c) => {
    const l = c.startsWith(":");
    const r = c.endsWith(":");
    return l && r ? "center" : r ? "right" : "left";
  });
  const rows = lines.slice(2).map((row) => tableCells(row, Boolean(tex)));
  return (
    <div key={key} className="slim-scroll my-5 overflow-x-auto rounded-card border border-content-line-strong">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-raised">
            {headers.map((h, ci) => (
              <th
                key={ci}
                className={`border-b border-content-line-strong px-3 py-2 font-medium text-ink ${alignClass[aligns[ci] ?? "left"]}`}
              >
                {inline(h, `${key}-h${ci}`, tex)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, ri) => (
            <tr key={ri} className="border-b border-content-line-strong last:border-0">
              {cells.map((c, ci) => (
                <td
                  key={ci}
                  className={`px-3 py-2 align-top text-ink-muted ${alignClass[aligns[ci] ?? "left"]}`}
                >
                  {inline(c, `${key}-r${ri}c${ci}`, tex)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderLines(text: string, keyBase: string, tex: Typeset | null = null): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const blocks = text.split(/\n{2,}/).filter((b) => b.trim());
  blocks.forEach((block, bi) => {
    const key = `${keyBase}-b${bi}`;
    const lines = block.split("\n");
    const first = lines[0];

    // Display math: a block of its own from $$ to $$, centered, that
    // scrolls sideways inside itself when it's wider than the column, never
    // the page. KaTeX's markup, made the way inline math's is.
    const display = tex ? displayMath(block) : null;
    if (tex && display !== null) {
      nodes.push(
        <div
          key={key}
          className="math-display slim-scroll my-5 overflow-x-auto overflow-y-hidden"
          dangerouslySetInnerHTML={{ __html: tex(display, true) }}
        />
      );
      return;
    }

    if (/^###\s/.test(first)) {
      nodes.push(
        <h4 key={key} className="font-display mt-7 text-lg font-medium break-words">
          {inline(first.replace(/^###\s+/, ""), key, tex)}
        </h4>
      );
      const rest = lines.slice(1).join("\n");
      if (rest.trim()) nodes.push(...renderLines(rest, key + "r", tex));
      return;
    }
    if (/^##\s/.test(first)) {
      nodes.push(
        <h3 key={key} className="font-display mt-9 text-xl font-medium break-words">
          {inline(first.replace(/^##\s+/, ""), key, tex)}
        </h3>
      );
      const rest = lines.slice(1).join("\n");
      if (rest.trim()) nodes.push(...renderLines(rest, key + "r", tex));
      return;
    }
    if (/^#\s/.test(first)) {
      nodes.push(
        <h2 key={key} className="font-display mt-9 text-title break-words">
          {inline(first.replace(/^#\s+/, ""), key, tex)}
        </h2>
      );
      const rest = lines.slice(1).join("\n");
      if (rest.trim()) nodes.push(...renderLines(rest, key + "r", tex));
      return;
    }

    // Horizontal rule: a standalone line of --- / *** / ___ (3+). Checked before
    // the table branch (which needs a `|`), so it never collides with tables.
    if (lines.length === 1 && /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(first)) {
      nodes.push(<hr key={key} className="my-8 h-px border-0 bg-content-line" />);
      return;
    }

    // Pipe table: a header row, a `|---|` separator, then body rows.
    if (
      lines.length >= 2 &&
      first.includes("|") &&
      isTableSeparator(lines[1])
    ) {
      nodes.push(renderTable(lines, key, tex));
      return;
    }

    if (lines.every((l) => /^>\s?/.test(l))) {
      nodes.push(
        <blockquote
          key={key}
          className="my-4 border-l-2 border-accent-strong pl-4 text-ink-muted"
        >
          {renderLines(lines.map((l) => l.replace(/^>\s?/, "")).join("\n"), key + "q", tex)}
        </blockquote>
      );
      return;
    }

    if (lines.every((l) => /^-\s/.test(l))) {
      nodes.push(
        <ul key={key} className="my-4 list-disc space-y-1.5 pl-6 break-words">
          {lines.map((l, li) => (
            <li key={li}>{inline(l.replace(/^-\s+/, ""), `${key}-${li}`, tex)}</li>
          ))}
        </ul>
      );
      return;
    }

    if (lines.every((l) => /^\d+\.\s/.test(l))) {
      nodes.push(
        <ol key={key} className="my-4 list-decimal space-y-1.5 pl-6 break-words">
          {lines.map((l, li) => (
            <li key={li}>{inline(l.replace(/^\d+\.\s+/, ""), `${key}-${li}`, tex)}</li>
          ))}
        </ol>
      );
      return;
    }

    nodes.push(
      <p key={key} className="my-4 leading-relaxed break-words">
        {inline(block, key, tex)}
      </p>
    );
  });
  return nodes;
}

/** Where a page's code examples run: `course` is the course whose fences
    they are (content/courses.json, Math's running in Python's), `scope`
    names the page for saving your edits (learn/<course>/<lesson>, so two
    courses' lessons never share them), `setup` builds the tables SQL
    examples work on, and on the runner
    `fixtures` and `clock` are the lesson's own fixture set and frozen time,
    so a Bash example reads the files its lesson describes. */
export interface RunnableContext {
  course: string;
  scope: string;
  setup?: string;
  fixtures?: string;
  clock?: string;
}

/**
 * Renders content Markdown. With `runnable`, every code example in a
 * language its course runs becomes a RunnableSnippet (run it, edit it,
 * reset it); without it, and for text and `norun` blocks, code shows as a
 * plain block you can copy. Hidden harness and stdin blocks never show. A
 * ```diagram fence draws its diagram from `diagrams` (the part page loads
 * each one it shows), its line as the caption. Under LessonMath its math
 * is typeset, but for a caption's, which is plain symbols (x², −2), and
 * elsewhere a $ is a dollar.
 */
export function LessonMarkdown({
  md,
  runnable,
  diagrams,
}: {
  md: string;
  runnable?: RunnableContext;
  diagrams?: Record<string, DiagramData>;
}) {
  const tex = useContext(LessonMath);
  return (
    <>
      {segmentMarkdown(md, runnable?.course).map((seg, i) =>
        seg.type === "diagram" ? (
          // The part page fails its build when a diagram is missing, so
          // there's nothing to draw only where none was loaded.
          diagrams?.[seg.name] ? (
            <Diagram key={i} data={diagrams[seg.name]} caption={seg.caption ? inline(seg.caption, `d${i}`) : undefined} />
          ) : null
        ) : seg.type === "fence" ? (
          runnable && seg.runtime ? (
            <RunnableSnippet
              key={i}
              code={seg.content}
              runtime={seg.runtime}
              harness={seg.harness}
              stdin={seg.stdin}
              storageKey={`${runnable.scope}:${snippetHash(seg.content)}`}
              setup={runnable.setup}
              fixtures={runnable.fixtures}
              clock={runnable.clock}
              className="my-5"
            />
          ) : (
            <CopyableCodeBlock
              key={i}
              code={seg.content}
              language={seg.language}
              className="my-5"
              preClassName="code-dark slim-scroll overflow-x-auto rounded-card border border-code-content-line bg-code-bg p-4 pr-16 font-mono text-[13px] leading-6 text-code-ink"
            >
              <Highlight code={seg.content} language={seg.language} />
            </CopyableCodeBlock>
          )
        ) : (
          <React.Fragment key={i}>{renderLines(seg.content, `s${i}`, tex)}</React.Fragment>
        )
      )}
    </>
  );
}
