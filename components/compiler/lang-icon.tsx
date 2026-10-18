import {
  siPython,
  siJavascript,
  siTypescript,
  siC,
  siCplusplus,
  siOpenjdk,
  siGo,
  siRust,
  siGnubash,
  siSqlite,
  siHaskell,
  siKotlin,
  siSwift,
  siLua,
  siElixir,
  siPerl,
  siRuby,
  siPhp,
} from "simple-icons";

// Monochrome brand glyphs (rendered in currentColor) for the compiler rail.
// Java has no standalone mark in simple-icons (trademark) — OpenJDK stands in;
// SQL uses the SQLite mark since that's the engine we run. C# also has no
// trademark-free brand glyph, so it's rendered as a "C#" wordmark below.
const ICONS: Record<string, { path: string }> = {
  python: siPython,
  javascript: siJavascript,
  typescript: siTypescript,
  c: siC,
  cpp: siCplusplus,
  java: siOpenjdk,
  go: siGo,
  rust: siRust,
  haskell: siHaskell,
  kotlin: siKotlin,
  swift: siSwift,
  lua: siLua,
  elixir: siElixir,
  perl: siPerl,
  ruby: siRuby,
  php: siPhp,
  bash: siGnubash,
  sql: siSqlite,
};

export function LangIcon({
  slug,
  className = "size-5",
}: {
  slug: string;
  className?: string;
}) {
  // No trademark-free C# glyph exists — render a clean "C#" wordmark instead of
  // the .NET logo (which is related but not C#).
  if (slug === "csharp") {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden>
        <text
          x="12"
          y="13"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="17"
          fontWeight="700"
          fill="currentColor"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          C#
        </text>
      </svg>
    );
  }
  const icon = ICONS[slug];
  if (!icon) return null;
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d={icon.path} />
    </svg>
  );
}
