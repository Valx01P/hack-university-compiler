import { Star } from "lucide-react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { HeaderScroll } from "@/components/chrome/header-scroll";

/**
 * The header chrome: the wordmark on the left, the theme picker on the right,
 * with a quiet ask to star the project beside it (no room for it on phones).
 * It spans edge-to-edge so the wordmark lines up over the compiler panel.
 */
export function SiteHeader() {
  return (
    <header className="site-header sticky top-0 z-50">
      <HeaderScroll />
      <div className="relative flex h-16 items-center justify-between gap-2 px-4 sm:gap-4 sm:px-6">
        <Logo />
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
          <a
            href="https://github.com/Valx01P/hack-university-compiler"
            target="_blank"
            rel="noopener noreferrer"
            title="If Hack University helps you, star it on GitHub"
            className="hidden items-center gap-1.5 rounded-btn px-2 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-highlight hover:text-ink sm:inline-flex"
          >
            <Star className="size-3.5" aria-hidden />
            Star on GitHub
          </a>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
