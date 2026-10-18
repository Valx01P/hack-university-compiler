import Link from "next/link";

/** Typographic wordmark used in the chrome — thin, wide, all caps. */
export function Logo() {
  return (
    <Link
      href="/"
      className="flex min-w-0 items-center gap-3"
      aria-label="Hack University home"
    >
      {/* Tightens the letter-spacing on phones and truncates as a last resort,
          so the right-side controls are never pushed off a narrow screen. */}
      <span className="truncate font-semibold uppercase tracking-[0.14em] text-ink dark:text-gold text-xs sm:text-sm sm:tracking-[0.28em]">
        Hack&nbsp;University
      </span>
    </Link>
  );
}
