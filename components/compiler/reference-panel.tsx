"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { CheatsheetView } from "@/components/compiler/cheatsheet-view";
import { ChallengeDetail, ChallengeList } from "@/components/compiler/challenges-view";
import type { ChallengeProgress } from "@/lib/challenge-progress";
import type { Challenge, ReferenceData } from "@/lib/reference-types";

export type ReferenceTab = "cheatsheet" | "challenges";

const loaded = new Map<string, Promise<ReferenceData>>();

/** A language's reference and challenges, fetched the first time the panel
    opens and kept for the rest of the visit. */
export function useReferenceData(lang: string, enabled: boolean) {
  const [state, setState] = useState<{ lang: string; data: ReferenceData | null; error: string | null }>({
    lang,
    data: null,
    error: null,
  });
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    let request = loaded.get(lang);
    if (!request) {
      request = fetch(`/api/reference/${lang}`).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ReferenceData>;
      });
      loaded.set(lang, request);
    }
    request
      .then((data) => live && setState({ lang, data, error: null }))
      .catch(() => {
        loaded.delete(lang);
        if (live) setState({ lang, data: null, error: "Couldn't load the reference. Is the dev server still running?" });
      });
    return () => {
      live = false;
    };
  }, [lang, enabled]);
  return state.lang === lang ? state : { lang, data: null, error: null };
}

/**
 * The compiler's right-hand panel when Reference is on: the language's
 * cheatsheet and its challenges. Opening a challenge loads it into the
 * editor, and switching to the cheatsheet keeps you on it until you go back
 * to the list.
 */
export function ReferencePanel({
  ref,
  lang,
  langLabel,
  data,
  error,
  tab,
  onTab,
  challenge,
  next,
  progress,
  onOpenChallenge,
  onLeaveChallenge,
  onClose,
}: {
  ref?: React.Ref<HTMLElement>;
  lang: string;
  langLabel: string;
  data: ReferenceData | null;
  error: string | null;
  tab: ReferenceTab;
  onTab: (tab: ReferenceTab) => void;
  challenge: Challenge | null;
  next: Challenge | null;
  progress: ChallengeProgress;
  onOpenChallenge: (id: string) => void;
  onLeaveChallenge: () => void;
  onClose: () => void;
}) {
  const tabBtn = (id: ReferenceTab, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      onClick={() => onTab(id)}
      className={`rounded-btn px-2.5 py-1 text-xs font-medium uppercase tracking-wider transition-colors ${
        tab === id ? "bg-raised text-ink dark:text-gold" : "text-ink-faint hover:text-ink dark:hover:text-gold"
      }`}
    >
      {label}
      {id === "challenges" && challenge && tab !== "challenges" && <span className="ml-1.5 normal-case tracking-normal text-ink-faint">· {challenge.title}</span>}
    </button>
  );

  return (
    <section ref={ref} aria-label={`${langLabel} reference`} className="flex h-[80dvh] min-h-0 min-w-0 flex-col p-2 lg:h-auto">
      <div className="flex shrink-0 items-center gap-1 pb-2">
        <div role="tablist" aria-label="Reference" className="flex min-w-0 items-center gap-1">
          {tabBtn("cheatsheet", "Cheatsheet")}
          {tabBtn("challenges", "Challenges")}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the reference"
          title="Close the reference"
          className="ms-auto inline-flex size-7 items-center justify-center rounded-btn text-ink-faint transition-colors hover:bg-raised hover:text-ink"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-card border border-line bg-surface">
        {error ? (
          <p className="p-4 text-sm text-ink-muted">{error}</p>
        ) : !data ? (
          <p className="p-4 text-sm text-ink-faint">Loading the {langLabel} reference…</p>
        ) : tab === "cheatsheet" ? (
          data.cheatsheet.length ? (
            <CheatsheetView lang={lang} sections={data.cheatsheet} langLabel={langLabel} />
          ) : (
            <p className="p-4 text-sm text-ink-muted">The {langLabel} cheatsheet isn&apos;t written yet.</p>
          )
        ) : challenge ? (
          <ChallengeDetail
            key={challenge.id}
            challenge={challenge}
            category={data.categories.find((c) => c.id === challenge.category)?.title ?? challenge.category}
            progress={progress}
            next={next}
            onBack={onLeaveChallenge}
            onNext={() => next && onOpenChallenge(next.id)}
          />
        ) : data.challenges.length ? (
          <ChallengeList challenges={data.challenges} categories={data.categories} progress={progress} onOpen={onOpenChallenge} />
        ) : (
          <p className="p-4 text-sm text-ink-muted">No {langLabel} challenges yet.</p>
        )}
      </div>
    </section>
  );
}
