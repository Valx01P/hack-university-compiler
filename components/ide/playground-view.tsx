"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ChevronDown, GraduationCap, SquareTerminal } from "lucide-react";
import { CourseRail } from "@/components/chrome/course-rail";
import { FloatingNav } from "@/components/chrome/floating-nav";
import { HistoryArrows } from "@/components/chrome/history-arrows";
import { SandboxStatus } from "@/components/chrome/sandbox-status";
import { WorkspaceView } from "@/components/ide/workspace-view";
import { AnchoredPanel } from "@/components/ui/anchored-panel";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { useIsFullScreen } from "@/lib/full-screen";
import type { WorkspaceProps } from "@/lib/workspace-types";

/**
 * A playground (architecture §9): the IDE with no lesson column, in the
 * compiler's frame, with the same language rail down the left. Under the
 * title, one line says what this codebase is for. The menu leads to every
 * playground of the course: the playground itself, scratch playgrounds 1 to
 * 3, and every codebase as a sandbox (its golden checkpoint, no checks), each
 * at its own address, so a reload or a copied link lands in the same one.
 * Hovering a link there prefetches its page, and never opens anything.
 */

export interface PlaygroundLink {
  href: string;
  label: string;
  hint: string;
}

export function PlaygroundView({
  props,
  title,
  langLabel,
  links,
  current,
  learnHref,
}: {
  props: WorkspaceProps;
  title: string;
  langLabel: string;
  links: PlaygroundLink[];
  current: string;
  /** The course's Learn lessons, when it has some. */
  learnHref: string | null;
}) {
  const [menu, setMenu] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const full = useIsFullScreen();
  const compiler = props.compilerHref ? (
    <ConfirmButton
      tooltip={`Back to the ${langLabel} compiler`}
      title="Back to the compiler?"
      description="Your workspace stays as it is, files and terminals included."
      confirmLabel="Open compiler"
      href={props.compilerHref}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-btn border border-line px-2 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-raised hover:text-ink"
    >
      <SquareTerminal className="size-3.5" aria-hidden />
      Compiler
    </ConfirmButton>
  ) : null;
  const learn = learnHref ? (
    <ConfirmButton
      tooltip={`Learn ${langLabel} step by step`}
      title="Open Learn mode?"
      description="Short lessons that walk through this course's codebases. Your workspace stays as it is."
      confirmLabel="Open Learn"
      href={learnHref}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-btn border border-line px-2 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-raised hover:text-ink"
    >
      <GraduationCap className="size-3.5" aria-hidden />
      Learn
    </ConfirmButton>
  ) : null;
  const description = props.template.description;

  return (
    <div className="px-3 pt-2 pb-2 lg:h-[calc(100dvh-4rem-1px)] lg:overflow-hidden">
      <section className="stars-through flex h-[calc(100dvh-4rem-1px-1rem)] min-h-[32rem] flex-col rounded-card border border-line bg-surface lg:h-full lg:min-h-0 lg:overflow-hidden">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-1.5">
          <span className="flex min-w-0 items-center gap-0.5">
            <span className="-ml-1 flex items-center gap-0.5">
              <HistoryArrows />
            </span>
            <button
              ref={anchorRef}
              type="button"
              onClick={() => setMenu((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menu}
              className="ml-2 inline-flex min-w-0 items-center gap-1 rounded-btn px-1.5 py-0.5 text-xs text-ink-muted transition-colors hover:bg-raised hover:text-ink"
            >
              <span className="truncate">{title}</span>
              <ChevronDown className="size-3.5 shrink-0" aria-hidden />
            </button>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="hidden min-w-32 justify-end sm:flex">
              <SandboxStatus lang={props.course} />
            </span>
            {learn}
            {compiler}
          </span>
        </div>
        {description && <p className="shrink-0 border-b border-line px-4 py-1.5 text-xs text-ink-muted">{description}</p>}
        <AnchoredPanel anchorRef={anchorRef} open={menu} onClose={() => setMenu(false)} className="z-[150] w-72 rounded-card border border-edge bg-surface p-1.5 text-sm shadow-[var(--shadow-card)]">
          <nav aria-label={`${langLabel} playgrounds`} data-popup>
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMenu(false)}
                aria-current={l.href === current ? "page" : undefined}
                className={`flex flex-col rounded-btn px-2.5 py-1.5 transition-colors hover:bg-raised ${l.href === current ? "bg-raised text-ink" : "text-ink-muted hover:text-ink"}`}
              >
                <span className="text-[13px]">{l.label}</span>
                <span className="text-xs text-ink-faint">{l.hint}</span>
              </Link>
            ))}
          </nav>
        </AnchoredPanel>
        <div data-workspace className="flex min-h-0 flex-1">
          <CourseRail current={props.course} />
          <div className="flex min-w-0 flex-1 flex-col">
            <WorkspaceView key={props.id} props={props} toolbarEnd={full ? compiler : null} />
          </div>
        </div>
      </section>
      <FloatingNav />
    </div>
  );
}
