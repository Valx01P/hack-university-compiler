"use client";

import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Eye } from "lucide-react";
import { LessonMarkdown } from "@/components/learn/lesson-md";
import { CompleteIcon, PendingIcon } from "@/components/learn/complete-icon";
import type { ChallengeProgress } from "@/lib/challenge-progress";
import { DIFFICULTY_LABEL, type Challenge, type ChallengeDifficulty, type ReferenceCategory } from "@/lib/reference-types";
import { useEnter } from "@/lib/motion";

type StatusFilter = "all" | "todo" | "solved";

function StatusIcon({ id, progress, className = "size-4" }: { id: string; progress: ChallengeProgress; className?: string }) {
  if (progress.solved.has(id)) return <CompleteIcon className={className} />;
  if (progress.viewed.has(id)) return <Eye className={`${className} shrink-0 text-ink-faint`} aria-hidden />;
  return <PendingIcon className={className} />;
}

/**
 * The challenge list: short problems grouped by the same categories as the
 * reference, each marked solved (green check), viewed (eye), or not yet
 * opened, with difficulty and status filters.
 */
export function ChallengeList({
  challenges,
  categories,
  progress,
  onOpen,
}: {
  challenges: Challenge[];
  categories: ReferenceCategory[];
  progress: ChallengeProgress;
  onOpen: (id: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  useEnter(rootRef);
  const [difficulty, setDifficulty] = useState<ChallengeDifficulty | "all">("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const solved = challenges.filter((c) => progress.solved.has(c.id)).length;
  const visible = challenges.filter(
    (c) =>
      (difficulty === "all" || c.difficulty === difficulty) &&
      (status === "all" || (status === "solved") === progress.solved.has(c.id))
  );

  return (
    <div ref={rootRef} className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-edge px-3 py-2">
        <p className="mr-auto text-xs text-ink-muted">
          {solved} of {challenges.length} solved
        </p>
        <select
          aria-label="Difficulty"
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value as ChallengeDifficulty | "all")}
          className="field rounded-btn px-2 py-1 text-xs font-medium text-ink"
        >
          <option value="all">All levels</option>
          {(Object.keys(DIFFICULTY_LABEL) as ChallengeDifficulty[]).map((d) => (
            <option key={d} value={d}>
              {DIFFICULTY_LABEL[d]}
            </option>
          ))}
        </select>
        <select
          aria-label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          className="field rounded-btn px-2 py-1 text-xs font-medium text-ink"
        >
          <option value="all">All</option>
          <option value="todo">To do</option>
          <option value="solved">Solved</option>
        </select>
      </div>

      <div className="slim-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-6">
        {visible.length === 0 && <p className="px-2 pt-5 text-sm text-ink-muted">No challenges match these filters.</p>}
        {categories.map((cat) => {
          const items = visible.filter((c) => c.category === cat.id);
          if (!items.length) return null;
          return (
            <div key={cat.id} className="mt-3">
              <p className="eyebrow px-2 pb-1">{cat.title}</p>
              <ul>
                {items.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(c.id)}
                      className="flex w-full items-center gap-2.5 rounded-btn px-2 py-1.5 text-left text-sm text-ink-muted transition-colors hover:bg-raised hover:text-ink"
                    >
                      <StatusIcon id={c.id} progress={progress} />
                      <span className="min-w-0 flex-1 truncate">{c.title}</span>
                      <span className="shrink-0 text-xs text-ink-faint">{DIFFICULTY_LABEL[c.difficulty]}</span>
                      {progress.solved.has(c.id) && <span className="sr-only">(solved)</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * One challenge: the task, its input and output, hints, and the way on. You
 * write and check it in the editor, which holds this challenge's code until
 * you leave it.
 */
export function ChallengeDetail({
  challenge,
  category,
  progress,
  next,
  onBack,
  onNext,
}: {
  challenge: Challenge;
  category: string;
  progress: ChallengeProgress;
  next: Challenge | null;
  onBack: () => void;
  onNext: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  useEnter(rootRef);
  const [hints, setHints] = useState(0);
  const solved = progress.solved.has(challenge.id);

  return (
    <div ref={rootRef} className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-edge px-3 py-1.5">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-btn px-1.5 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-raised hover:text-ink"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          All challenges
        </button>
        {next && (
          <button
            type="button"
            onClick={onNext}
            title={next.title}
            className={`inline-flex min-w-0 items-center gap-1.5 rounded-btn border border-edge-strong px-2.5 py-1 text-xs font-medium ${
              solved ? "btn-grad" : "text-ink transition-colors hover:bg-raised"
            }`}
          >
            <span className="truncate">Next: {next.title}</span>
            <ArrowRight className="size-3.5 shrink-0" aria-hidden />
          </button>
        )}
      </div>
      <div className="slim-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-4">
        <p className="eyebrow">
          {category} · {DIFFICULTY_LABEL[challenge.difficulty]}
          {/* Always laid out, shown once solved, so nothing moves. */}
          <span className={`ml-1.5 inline-flex h-4 items-center align-top ${solved ? "" : "invisible"}`}>
            <CompleteIcon className="size-3.5" />
          </span>
          {solved && <span className="sr-only"> · Solved</span>}
        </p>
        <h2 className="font-display mt-1.5 text-title">{challenge.title}</h2>
        <div className="mt-3 text-[0.95rem] leading-relaxed [&>*:first-child]:mt-0">
          <LessonMarkdown md={challenge.statement} />
        </div>
        <p className="mt-5 text-sm text-ink-muted">
          Write your solution in the editor, then press <span className="font-medium text-ink">Check</span> to run it against{" "}
          {challenge.tests.length} test{challenge.tests.length === 1 ? "" : "s"}.
        </p>
        {challenge.hints.length > 0 && (
          <div className="mt-4">
            {hints > 0 && (
              <ol className="mb-2 list-decimal space-y-1.5 pl-5 text-sm text-ink-muted">
                {challenge.hints.slice(0, hints).map((h, i) => (
                  <li key={i}>
                    <LessonMarkdown md={h} />
                  </li>
                ))}
              </ol>
            )}
            {hints < challenge.hints.length && (
              <button
                type="button"
                onClick={() => setHints((n) => n + 1)}
                className="rounded-btn px-2.5 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-raised hover:text-ink"
              >
                {hints === 0 ? "Show a hint" : `Another hint (${hints}/${challenge.hints.length})`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export { StatusIcon };
