"use client";

import Link from "next/link";
import { Fragment } from "react";
import { CodeXml } from "lucide-react";
import { LangIcon } from "@/components/compiler/lang-icon";
import { COURSES, courseRows, type CourseEntry } from "@/lib/courses";

// A compiler's editor language (its slug) loads with the hover too, so its
// page opens with the editor ready (lib/editor-extensions.ts, already on
// every page with the rail).
const warm = (c: CourseEntry) => {
  if (c.page) void import("@/lib/editor-extensions").then((m) => m.loadLanguage(c.slug));
};

const linkClass = (active: boolean) =>
  `flex size-10 shrink-0 items-center justify-center rounded-btn transition-colors ${active ? "text-ink dark:text-gold" : "text-ink-muted hover:text-ink"}`;

/**
 * The rail down the left of the compiler and the playground: one icon per
 * compiler, in the Learn icon rows' order with a divider between the rows,
 * then the playground right under them, past one more divider. The project
 * courses aren't on it: Learn's course list has them. Hovering an icon
 * prefetches its page (components/chrome/hover-prefetch.tsx) and its
 * editor language, and never starts anything.
 */
export function CourseRail({ current }: { current: string }) {
  const rows = courseRows(COURSES.filter((c) => c.page));
  return (
    <nav
      aria-label="Courses"
      className="slim-scroll flex w-12 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-line py-2 sm:w-14"
    >
      {rows.map((row, r) => (
        <Fragment key={r}>
          {r > 0 && <span aria-hidden className="my-1 h-px w-6 shrink-0 bg-line" />}
          {row.map((c) => (
            <Link
              key={c.slug}
              href={`/${c.slug}`}
              prefetch={false}
              onPointerEnter={() => warm(c)}
              onFocus={() => warm(c)}
              title={`${c.label} compiler`}
              aria-label={`${c.label} compiler`}
              aria-current={c.slug === current ? "page" : undefined}
              className={linkClass(c.slug === current)}
            >
              <LangIcon slug={c.slug} className="size-5" />
            </Link>
          ))}
        </Fragment>
      ))}
      {/* Right under the compilers, past a divider like the rows'. */}
      <span aria-hidden className="my-1 h-px w-6 shrink-0 bg-line" />
      <Link
        href="/playground"
        prefetch={false}
        title="Playground"
        aria-label="Playground"
        aria-current={current === "playground" ? "page" : undefined}
        className={linkClass(current === "playground")}
      >
        <CodeXml className="size-5" aria-hidden />
      </Link>
    </nav>
  );
}
