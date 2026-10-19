"use client";

import { useState } from "react";
import { Check, Clipboard } from "lucide-react";

function fallbackCopy(text: string) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

export function CodeCopyButton({
  text,
  className = "",
  compact = false,
}: {
  text: string;
  className?: string;
  /** Just the icon (the label stays for screen readers and the tooltip). */
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        fallbackCopy(text);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      fallbackCopy(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Code copied" : "Copy code"}
      title={copied ? "Copied" : "Copy code"}
      className={`inline-flex h-7 items-center gap-1.5 rounded-btn border border-white/15 bg-[#111111] px-2 text-[11px] font-medium text-[#fafafa] shadow-sm transition-colors hover:bg-[#2a2a2a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong ${className}`}
    >
      {copied ? (
        <Check aria-hidden className="size-3.5" />
      ) : (
        <Clipboard aria-hidden className="size-3.5" />
      )}
      {!compact && <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>}
    </button>
  );
}
