"use client";

import { useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { LessonMarkdown } from "@/components/learn/lesson-md";
import type { ReferenceSection } from "@/lib/reference-types";

/** What each language's search box suggests looking for. */
const SEARCH_HINTS: Record<string, string> = {
  python: "list, import, split",
  javascript: "map, import, split",
  cpp: "vector, include, sort",
  java: "ArrayList, import, split",
  go: "slice, import, Split",
  sql: "join, group by, coalesce",
};

/** A section's own "###" blocks, so a search can show just the part that
    matches instead of the whole section. */
function blocks(md: string): string[] {
  return md.split(/^(?=### )/m).map((b) => b.trim()).filter(Boolean);
}

/**
 * The language reference: every category in roadmap order, a search that
 * narrows it to the sections (or the parts of sections) that mention what you
 * typed, and a jump menu.
 */
export function CheatsheetView({ lang, sections, langLabel }: { lang: string; sections: ReferenceSection[]; langLabel: string }) {
  const [query, setQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const q = query.trim().toLowerCase();

  const shown = useMemo(() => {
    if (!q) return sections;
    return sections
      .map((s) => {
        if (s.title.toLowerCase().includes(q)) return s;
        const parts = blocks(s.md).filter((b) => b.toLowerCase().includes(q));
        return parts.length ? { ...s, md: parts.join("\n\n") } : null;
      })
      .filter((s): s is ReferenceSection => s !== null);
  }, [sections, q]);

  function jump(id: string) {
    const el = scrollRef.current?.querySelector<HTMLElement>(`#ref-${id}`);
    if (el && scrollRef.current) scrollRef.current.scrollTop = el.offsetTop - 8;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-edge px-3 py-2">
        <label className="relative flex min-w-0 flex-1 items-center">
          <span className="sr-only">Search the {langLabel} reference</span>
          <Search className="pointer-events-none absolute left-2.5 size-3.5 text-ink-faint" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${langLabel}: ${SEARCH_HINTS[lang] ?? "loops, strings, functions"}…`}
            className="field w-full rounded-btn py-1.5 pl-8 pr-7 text-sm text-ink"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear the search"
              className="absolute right-1.5 inline-flex size-5 items-center justify-center rounded-btn text-ink-faint hover:text-ink"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          )}
        </label>
        <select
          aria-label="Jump to a section"
          value=""
          onChange={(e) => e.target.value && jump(e.target.value)}
          className="field w-36 shrink-0 rounded-btn px-2 py-1.5 text-xs font-medium text-ink"
        >
          <option value="">Jump to…</option>
          {shown.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </div>

      <div ref={scrollRef} className="slim-scroll relative min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-2">
        {shown.length === 0 ? (
          <p className="pt-6 text-sm text-ink-muted">Nothing in the {langLabel} reference mentions “{query}”.</p>
        ) : (
          shown.map((s) => (
            <section key={s.id} id={`ref-${s.id}`} className="border-b border-edge pb-6 pt-5 last:border-0">
              <h3 className="font-display text-xl font-medium text-ink">{s.title}</h3>
              <div className="text-[0.92rem] leading-relaxed [&>*:first-child]:mt-2">
                <LessonMarkdown md={s.md} />
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
