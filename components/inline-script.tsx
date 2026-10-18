"use client";

/**
 * An inline `<script>` that runs synchronously during HTML parsing (before
 * first paint) on hard loads, without React's dev warning about rendering a
 * script tag on the client.
 *
 * During SSR `typeof window === "undefined"` is true, so the emitted HTML
 * carries `type="text/javascript"` and the browser executes it while parsing.
 * On the client this component re-renders with `type="text/plain"`, which
 * React DOM treats as a non-executable "script data block" and so skips its
 * "script tag while rendering" warning; `suppressHydrationWarning` reconciles
 * the type mismatch. This MUST be a Client Component — as a Server Component
 * the server-computed `text/javascript` would be baked into the payload and
 * the client would never flip it to `text/plain`, so the warning would fire.
 * Pattern from the Next.js "Preventing Flash before Hydration" guide.
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
