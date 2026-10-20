"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { CheatsheetView } from "@/components/compiler/cheatsheet-view";
import { ChallengeDetail, ChallengeList } from "@/components/compiler/challenges-view";
import type { ChallengeProgress } from "@/lib/challenge-progress";
import type { Challenge, ReferenceData } from "@/lib/reference-types";
import { EASE, dur, gsap } from "@/lib/motion";

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
        if (live) setState({ lang, data: null, error: "Couldn't load the cheatsheet and challenges. Is the dev server still running?" });
      });
    return () => {
      live = false;
    };
  }, [lang, enabled]);
  return state.lang === lang ? state : { lang, data: null, error: null };
}

/**
 * The compiler's right-hand panel: the language's cheatsheet or its
 * challenges. Its header carries the Cheatsheet, Challenges, and Learn
 * buttons while it's open (they sit above the output otherwise), so they stay
 * in the same place and switching is one click.
 *
 * Both views stay mounted and only the one you picked shows, so each keeps
 * exactly where you left it: the cheatsheet's search and scroll, the list's
 * filters and scroll, and an open challenge with its hints. The list stays
 * under an open challenge too, so going back lands where you were. Opening a
 * challenge loads it into the editor, and switching to the cheatsheet keeps
 * you on it until you go back to the list.
 */
export function ReferencePanel({
  ref,
  hidden,
  lang,
  langLabel,
  data,
  error,
  tab,
  buttons,
  challenge,
  next,
  previous,
  progress,
  onOpenChallenge,
  onLeaveChallenge,
  onClose,
}: {
  ref?: React.Ref<HTMLElement>;
  /** Closed: kept mounted, so everything is as you left it when it reopens. */
  hidden: boolean;
  lang: string;
  langLabel: string;
  data: ReferenceData | null;
  error: string | null;
  tab: ReferenceTab;
  /** The Cheatsheet, Challenges, and Learn buttons. */
  buttons: React.ReactNode;
  challenge: Challenge | null;
  next: Challenge | null;
  previous: Challenge | null;
  progress: ChallengeProgress;
  onOpenChallenge: (id: string) => void;
  onLeaveChallenge: () => void;
  onClose: () => void;
}) {
  // Switching views fades the new one in.
  const cheatRef = useRef<HTMLDivElement>(null);
  const challengesRef = useRef<HTMLDivElement>(null);
  const shownTab = useRef(tab);
  useLayoutEffect(() => {
    if (shownTab.current === tab) return;
    shownTab.current = tab;
    const view = tab === "cheatsheet" ? cheatRef.current : challengesRef.current;
    if (view) gsap.fromTo(view, { opacity: 0 }, { opacity: 1, duration: dur(0.18), ease: EASE.out, clearProps: "opacity" });
  }, [tab]);

  // Closing hides the whole panel (display: none), which browsers don't
  // always come back from at the same scroll. Remember each scroll position
  // as you scroll, and put them back when it reopens.
  const scrolled = useRef(new Map<Element, number>());
  useLayoutEffect(() => {
    if (hidden) return;
    for (const [el, top] of scrolled.current) {
      if (el.isConnected && el.scrollTop !== top) el.scrollTop = top;
    }
  }, [hidden]);

  // Every view stays laid out, stacked in the same spot, and the ones you
  // aren't on are invisible and inert. Nothing is ever display: none, so
  // each keeps its scroll position too.
  const layer = (shown: boolean) => `absolute inset-0 flex flex-col ${shown ? "" : "invisible"}`;

  return (
    <section
      ref={ref}
      onScrollCapture={(e) => {
        if (!hidden) scrolled.current.set(e.target as Element, (e.target as Element).scrollTop);
      }}
      aria-label={`${langLabel} cheatsheet and challenges`}
      className={`${hidden ? "hidden" : "flex"} h-[80dvh] min-h-0 min-w-0 flex-col p-2 lg:h-auto`}
    >
      <div className="slim-scroll -mx-1.5 -mt-1.5 flex shrink-0 items-center gap-1 overflow-x-auto px-1.5 pt-1.5 pb-2">
        <h2 className="sr-only">
          {langLabel} {tab}
        </h2>
        <div className="ms-auto flex shrink-0 items-center gap-1">{buttons}</div>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close the ${tab}`}
          title={`Close the ${tab}`}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-btn text-ink-faint transition-colors hover:bg-highlight hover:text-ink"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-card border border-line bg-surface">
        {error ? (
          <p className="p-4 text-sm text-ink-muted">{error}</p>
        ) : !data ? (
          <p className="p-4 text-sm text-ink-faint">Loading the {langLabel} {tab}…</p>
        ) : (
          <div className="relative min-h-0 flex-1">
            <div ref={cheatRef} className={layer(tab === "cheatsheet")} inert={tab !== "cheatsheet"}>
              {data.cheatsheet.length ? (
                <CheatsheetView lang={lang} sections={data.cheatsheet} langLabel={langLabel} />
              ) : (
                <p className="p-4 text-sm text-ink-muted">The {langLabel} cheatsheet isn&apos;t written yet.</p>
              )}
            </div>
            <div ref={challengesRef} className={layer(tab === "challenges")} inert={tab !== "challenges"}>
              {challenge && (
                <div className={layer(true)}>
                  <ChallengeDetail
                    key={challenge.id}
                    challenge={challenge}
                    category={data.challengeCategories.find((c) => c.id === challenge.category)?.title ?? challenge.category}
                    progress={progress}
                    next={next}
                    previous={previous}
                    onPrevious={() => previous && onOpenChallenge(previous.id)}
                    onBack={onLeaveChallenge}
                    onNext={() => next && onOpenChallenge(next.id)}
                  />
                </div>
              )}
              <div className={layer(!challenge)} inert={Boolean(challenge)}>
                {data.challenges.length ? (
                  <ChallengeList challenges={data.challenges} categories={data.challengeCategories} progress={progress} onOpen={onOpenChallenge} />
                ) : (
                  <p className="p-4 text-sm text-ink-muted">No {langLabel} challenges yet.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
