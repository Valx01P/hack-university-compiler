import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { HeaderScroll } from "@/components/chrome/header-scroll";

/**
 * The header chrome: the wordmark on the left, the theme picker on the right.
 * It spans edge-to-edge so the wordmark lines up over the compiler panel.
 */
export function SiteHeader() {
  return (
    <header className="site-header sticky top-0 z-50">
      <HeaderScroll />
      <div className="relative flex h-16 items-center justify-between gap-2 px-4 sm:gap-4 sm:px-6">
        <Logo />
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
