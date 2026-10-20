"use client";

import Link from "next/link";
import { Fragment } from "react";
import { LangIcon } from "@/components/compiler/lang-icon";
import { COURSES, courseRows, type CourseEntry } from "@/lib/courses";

// Every course on the rail, in the Learn icon rows' order: a course with a
// compiler page opens it, and a course without one (the stacks that live in
// a project, like React or Spring Boot) opens its playground.
const RAIL = courseRows(COURSES.filter((c) => c.page || c.playground));

const railHref = (c: CourseEntry) => (c.page ? `/${c.slug}` : `/${c.slug}/playground`);
const railLabel = (c: CourseEntry) => (c.page ? `${c.label} compiler` : `${c.label} playground`);

/**
 * The language rail down the left of the compiler and the playgrounds: one
 * icon per course, with a divider between the Learn icon rows. Hovering an
 * icon prefetches its page, and never starts anything.
 */
export function CourseRail({ current }: { current: string }) {
  return (
    <nav
      aria-label="Languages"
      className="slim-scroll flex w-12 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-line py-2 sm:w-14"
    >
      {RAIL.map((row, r) => (
        <Fragment key={r}>
          {r > 0 && <span aria-hidden className="my-1 h-px w-6 shrink-0 bg-line" />}
          {row.map((c) => {
            const active = c.slug === current;
            return (
              <Link
                key={c.slug}
                href={railHref(c)}
                title={railLabel(c)}
                aria-label={railLabel(c)}
                aria-current={active ? "page" : undefined}
                className={`flex size-10 shrink-0 items-center justify-center rounded-btn transition-colors ${
                  active ? "text-ink dark:text-gold" : "text-ink-muted hover:text-ink"
                }`}
              >
                <LangIcon slug={c.slug} className="size-5" />
              </Link>
            );
          })}
        </Fragment>
      ))}
    </nav>
  );
}
