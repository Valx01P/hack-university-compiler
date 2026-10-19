"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { LessonMarkdown } from "@/components/learn/lesson-md";
import { SAMPLE_DB_SQL } from "@/lib/sql/sample-db";
import { cheatsheetBlocks, type CheatsheetHit } from "@/lib/reference-blocks";
import { cheatsheetPlace, writeUrl } from "@/lib/compiler-url";
import type { ReferenceSection } from "@/lib/reference-types";
import { EASE, dur, gsap } from "@/lib/motion";

/** What each language's search box suggests looking for. */
const SEARCH_HINTS: Record<string, string> = {
  python: "list methods, read input",
  javascript: "array methods, map lookup",
  cpp: "vector methods, hashmap",
  java: "ArrayList methods, string to int",
  go: "slice methods, map lookup",
  sql: "count per group, join",
};

/** Sections, or the parts of sections, that contain the text (the search
    for a letter or two, and the fallback when the ranked search can't run). */
function textMatches(sections: ReferenceSection[], q: string): ReferenceSection[] {
  return sections
    .map((s) => {
      if (s.title.toLowerCase().includes(q)) return s;
      const parts = cheatsheetBlocks(s.md).filter((b) => b.toLowerCase().includes(q));
      return parts.length ? { ...s, md: parts.join("\n\n") } : null;
    })
    .filter((s): s is ReferenceSection => s !== null);
}

/** The ranked search's hits as sections: the best one first, each showing
    just its matching blocks, in their own order. */
function rankedSections(sections: ReferenceSection[], hits: CheatsheetHit[]): ReferenceSection[] {
  const picked = new Map<string, number[]>();
  for (const h of hits) picked.set(h.section, [...(picked.get(h.section) ?? []), h.block]);
  return [...picked].flatMap(([id, picks]) => {
    const s = sections.find((x) => x.id === id);
    if (!s) return [];
    const parts = cheatsheetBlocks(s.md);
    const md = [...picks]
      .sort((a, b) => a - b)
      .map((i) => parts[i])
      .filter(Boolean)
      .join("\n\n");
    return md ? [{ ...s, md }] : [];
  });
}

/**
 * The language's cheatsheet: every category in roadmap order, a search, and
 * a jump menu. From three letters on, the search ranks the cheatsheet's
 * blocks by what you mean as well as the words you typed (/api/search, run
 * on this machine), so "list methods" finds adding, removing, and sorting.
 * Its search and the section at the top are kept in the address while the
 * panel is open (lib/compiler-url.ts), so a reload comes back to them.
 */
export function CheatsheetView({ lang, sections, langLabel }: { lang: string; sections: ReferenceSection[]; langLabel: string }) {
  const [query, setQuery] = useState(() => cheatsheetPlace.q);
  const scrollRef = useRef<HTMLDivElement>(null);
  const q = query.trim().toLowerCase();
  // The latest ranked results, for the query they answer (null: use text).
  const [ranked, setRanked] = useState<{ q: string; hits: CheatsheetHit[] | null } | null>(null);
  const warmed = useRef(false);

  useEffect(() => {
    if (q.length < 3) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?lang=${encodeURIComponent(lang)}&q=${encodeURIComponent(q)}`, { signal: controller.signal });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { hits: CheatsheetHit[] };
        setRanked({ q, hits: data.hits });
      } catch {
        if (!controller.signal.aborted) setRanked({ q, hits: null });
      }
    }, 120);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [q, lang]);

  const shown = useMemo(() => {
    if (!q) return sections;
    if (q.length < 3) return textMatches(sections, q);
    // Until this query's results arrive, keep showing the last ones.
    if (!ranked) return textMatches(sections, q);
    return ranked.hits ? rankedSections(sections, ranked.hits) : textMatches(sections, ranked.q);
  }, [sections, q, ranked]);

  // Remember the search, and put it in the address (it only changes while
  // the panel shows it, and closing the panel clears it).
  useEffect(() => {
    cheatsheetPlace.q = q;
    if (q) cheatsheetPlace.at = "";
    writeUrl(q ? { q, at: "" } : { q: "" });
  }, [q]);

  // Back to the section you were reading (a search starts at its top).
  useLayoutEffect(() => {
    const box = scrollRef.current;
    const at = cheatsheetPlace.at;
    if (!box || !at || q) return;
    const el = box.querySelector<HTMLElement>(`#ref-${at}`);
    if (el) box.scrollTop = el.offsetTop - 8;
    // Once, when the cheatsheet first shows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // As you read, the section at the top becomes the one to come back to.
  const scrollFrame = useRef(0);
  function onScroll() {
    if (scrollFrame.current) return;
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = 0;
      const box = scrollRef.current;
      if (!box || q) return;
      let top = "";
      for (const el of box.querySelectorAll<HTMLElement>("section[id^='ref-']")) {
        if (el.offsetTop - 16 <= box.scrollTop) top = el.id.slice(4);
        else break;
      }
      // At the very top, there's nothing to come back to.
      if (box.scrollTop < 8) top = "";
      if (top === cheatsheetPlace.at) return;
      cheatsheetPlace.at = top;
      writeUrl({ at: top });
    });
  }

  function jump(id: string) {
    const el = scrollRef.current?.querySelector<HTMLElement>(`#ref-${id}`);
    if (el && scrollRef.current) {
      gsap.to(scrollRef.current, { scrollTo: { y: el.offsetTop - 8 }, duration: dur(0.5), ease: EASE.inOut, overwrite: true });
    }
  }

  // Focusing the box shows intent: get the search (and its model) ready.
  function warm() {
    if (warmed.current) return;
    warmed.current = true;
    void fetch(`/api/search?lang=${encodeURIComponent(lang)}&q=`).catch(() => {});
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-content-line px-3 py-2">
        <label className="relative flex min-w-0 flex-1 items-center">
          <span className="sr-only">Search the {langLabel} cheatsheet</span>
          <Search className="pointer-events-none absolute left-2.5 size-3.5 text-ink-faint" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={warm}
            onPointerEnter={warm}
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

      <div ref={scrollRef} onScroll={onScroll} className="slim-scroll relative min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-2">
        {shown.length === 0 ? (
          <p className="pt-6 text-sm text-ink-muted">Nothing in the {langLabel} cheatsheet matches “{query}”.</p>
        ) : (
          shown.map((s) => (
            <section key={s.id} id={`ref-${s.id}`} className="border-b border-content-line pb-6 pt-5 last:border-0">
              <h3 className="font-display text-xl font-medium text-ink">{s.title}</h3>
              <div className="text-[0.92rem] leading-relaxed [&>*:first-child]:mt-2">
                <LessonMarkdown md={s.md} runnable={{ course: lang, scope: `ref/${lang}/${s.id}`, setup: lang === "sql" ? SAMPLE_DB_SQL : undefined }} />
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
