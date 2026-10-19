import React from "react";
import { Highlight } from "@/lib/highlight";
import { CopyableCodeBlock } from "@/components/ui/copyable-code-block";
import { RunnableSnippet } from "@/components/learn/runnable-snippet";
import { segmentMarkdown } from "@/lib/snippet-harness.mjs";
import { snippetHash } from "@/lib/snippet-edits";

/**
 * Renderer for the content-markdown subset:
 * # ## ### headings, paragraphs, **bold**, *em*, `code`, ```fences,
 * [links](url), - lists, 1. lists, > blockquotes, | pipe | tables |.
 * No raw HTML passthrough.
 */

/** Only allow safe link targets; anything else renders as plain text so a
    crafted `javascript:`/`data:` URL can never become a clickable link. */
function safeHref(url: string): string | null {
  const u = url.trim();
  if (/^(https?:\/\/|mailto:|\/|#)/i.test(u)) return u;
  return null;
}

function inline(text: string, keyBase: string): React.ReactNode[] {
  // Tokenize inline: [text](url), `code`, **bold**, *em*
  const out: React.ReactNode[] = [];
  const re =
    /(\[[^\]]+\]\([^)\s]+\))|(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)/g;
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(text.slice(last, idx));
    const tok = m[0];
    const key = `${keyBase}-${i++}`;
    if (tok.startsWith("[")) {
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
          {tok.slice(1, -1)}
        </code>
      );
    } else if (tok.startsWith("**")) {
      out.push(<strong key={key}>{inline(tok.slice(2, -2), `${key}-strong`)}</strong>);
    } else {
      out.push(<em key={key}>{inline(tok.slice(1, -1), `${key}-em`)}</em>);
    }
    last = idx + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** A pipe-table separator row, e.g. `|---|:--:|--:|`. */
function isTableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
}

/** Split one table row into trimmed cells, dropping the outer pipes. Escaped
    pipes (`\|`, e.g. SQL's `||` operator) are NOT column separators — they're
    split-safe and unescaped back to a literal `|` in the cell. */
function tableCells(row: string): string[] {
  let s = row.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
}

type Align = "left" | "center" | "right";
const alignClass: Record<Align, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

function renderTable(lines: string[], key: string): React.ReactNode {
  const headers = tableCells(lines[0]);
  const aligns: Align[] = tableCells(lines[1]).map((c) => {
    const l = c.startsWith(":");
    const r = c.endsWith(":");
    return l && r ? "center" : r ? "right" : "left";
  });
  const rows = lines.slice(2).map(tableCells);
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
                {inline(h, `${key}-h${ci}`)}
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
                  {inline(c, `${key}-r${ri}c${ci}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderLines(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const blocks = text.split(/\n{2,}/).filter((b) => b.trim());
  blocks.forEach((block, bi) => {
    const key = `${keyBase}-b${bi}`;
    const lines = block.split("\n");
    const first = lines[0];

    if (/^###\s/.test(first)) {
      nodes.push(
        <h4 key={key} className="font-display mt-7 text-lg font-medium break-words">
          {inline(first.replace(/^###\s+/, ""), key)}
        </h4>
      );
      const rest = lines.slice(1).join("\n");
      if (rest.trim()) nodes.push(...renderLines(rest, key + "r"));
      return;
    }
    if (/^##\s/.test(first)) {
      nodes.push(
        <h3 key={key} className="font-display mt-9 text-xl font-medium break-words">
          {inline(first.replace(/^##\s+/, ""), key)}
        </h3>
      );
      const rest = lines.slice(1).join("\n");
      if (rest.trim()) nodes.push(...renderLines(rest, key + "r"));
      return;
    }
    if (/^#\s/.test(first)) {
      nodes.push(
        <h2 key={key} className="font-display mt-9 text-title break-words">
          {inline(first.replace(/^#\s+/, ""), key)}
        </h2>
      );
      const rest = lines.slice(1).join("\n");
      if (rest.trim()) nodes.push(...renderLines(rest, key + "r"));
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
      nodes.push(renderTable(lines, key));
      return;
    }

    if (lines.every((l) => /^>\s?/.test(l))) {
      nodes.push(
        <blockquote
          key={key}
          className="my-4 border-l-2 border-accent-strong pl-4 text-ink-muted"
        >
          {renderLines(lines.map((l) => l.replace(/^>\s?/, "")).join("\n"), key + "q")}
        </blockquote>
      );
      return;
    }

    if (lines.every((l) => /^-\s/.test(l))) {
      nodes.push(
        <ul key={key} className="my-4 list-disc space-y-1.5 pl-6 break-words">
          {lines.map((l, li) => (
            <li key={li}>{inline(l.replace(/^-\s+/, ""), `${key}-${li}`)}</li>
          ))}
        </ul>
      );
      return;
    }

    if (lines.every((l) => /^\d+\.\s/.test(l))) {
      nodes.push(
        <ol key={key} className="my-4 list-decimal space-y-1.5 pl-6 break-words">
          {lines.map((l, li) => (
            <li key={li}>{inline(l.replace(/^\d+\.\s+/, ""), `${key}-${li}`)}</li>
          ))}
        </ol>
      );
      return;
    }

    nodes.push(
      <p key={key} className="my-4 leading-relaxed break-words">
        {inline(block, key)}
      </p>
    );
  });
  return nodes;
}

/** Where a page's code examples run: `scope` names the page for saving
    your edits, `setup` builds the tables SQL examples work on. */
export interface RunnableContext {
  scope: string;
  setup?: string;
}

/**
 * Renders content Markdown. With `runnable`, every code example in a
 * language the sandbox runs becomes a RunnableSnippet (run it, edit it,
 * reset it); without it, and for text and `norun` blocks, code shows as a
 * plain block you can copy. Hidden harness and stdin blocks never show.
 */
export function LessonMarkdown({ md, runnable }: { md: string; runnable?: RunnableContext }) {
  return (
    <>
      {segmentMarkdown(md).map((seg, i) =>
        seg.type === "fence" ? (
          runnable && seg.runtime ? (
            <RunnableSnippet
              key={i}
              code={seg.content}
              runtime={seg.runtime}
              harness={seg.harness}
              stdin={seg.stdin}
              storageKey={`${runnable.scope}:${snippetHash(seg.content)}`}
              setup={runnable.setup}
              className="my-5"
            />
          ) : (
            <CopyableCodeBlock
              key={i}
              code={seg.content}
              className="my-5"
              preClassName="code-dark slim-scroll overflow-x-auto rounded-card border border-code-content-line bg-code-bg p-4 pr-16 font-mono text-[13px] leading-6 text-code-ink"
            >
              <Highlight code={seg.content} language={seg.language} />
            </CopyableCodeBlock>
          )
        ) : (
          <React.Fragment key={i}>{renderLines(seg.content, `s${i}`)}</React.Fragment>
        )
      )}
    </>
  );
}
