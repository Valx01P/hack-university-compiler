import { siPython, siJavascript, siCplusplus, siOpenjdk, siGo } from "simple-icons";

// Monochrome brand glyphs (rendered in currentColor) for the compiler rail.
// Java has no standalone mark in simple-icons (trademark), so OpenJDK stands in.
const ICONS: Record<string, { path: string }> = {
  python: siPython,
  javascript: siJavascript,
  cpp: siCplusplus,
  java: siOpenjdk,
  go: siGo,
};

export function LangIcon({
  slug,
  className = "size-5",
}: {
  slug: string;
  className?: string;
}) {
  const icon = ICONS[slug];
  if (!icon) return null;
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d={icon.path} />
    </svg>
  );
}
