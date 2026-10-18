import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <section className="flex min-h-[calc(100svh-4rem)] items-center">
      <div className="shell flex w-full -translate-y-8 flex-col items-center gap-6 py-16 text-center">
        <p className="eyebrow">Error 404</p>
        <h1 className="font-display max-w-[18ch] text-hero">
          This page wandered off.
        </h1>
        <p className="max-w-[48ch] text-lead text-ink-muted">
          There&apos;s no compiler at this address. Head back and pick a language
          from the rail.
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="rounded-btn border border-edge-strong px-5 py-2.5 text-sm font-medium btn-grad"
          >
            Back home
          </Link>
        </div>
      </div>
    </section>
  );
}
