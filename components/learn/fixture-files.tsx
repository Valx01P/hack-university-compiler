"use client";

import { useState } from "react";
import { ScrollPre } from "@/components/ui/scroll-pre";
import { Highlight } from "@/lib/highlight";
import type { FixtureFile } from "@/lib/learn-fixtures";

// The tokenizer for a file's own language, by its extension.
const LANGUAGES: Record<string, string> = { sh: "bash", bash: "bash", py: "python", js: "javascript", sql: "sql" };

function sizeOf(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
}

/**
 * The fixture files a program starts in, opened from the editor's Files
 * strip: each file as a button, and the one you pick shown below, read only.
 * Runs never change them (every run starts from a fresh copy).
 */
export function FixtureFiles({ id, set, files }: { id: string; set: string; files: FixtureFile[] }) {
  const [shown, setShown] = useState<string | null>(null);
  const file = files.find((f) => f.path === shown) ?? null;
  const language = file ? LANGUAGES[file.path.split(".").pop() ?? ""] : undefined;
  return (
    <div id={id} className="border-t border-code-content-line px-3 py-2 font-mono text-xs text-code-ink">
      <ul aria-label={`The ${set} files, read only`} className="flex flex-wrap gap-1">
        {files.map((f) => (
          <li key={f.path}>
            <button
              type="button"
              onClick={() => setShown(shown === f.path ? null : f.path)}
              aria-pressed={shown === f.path}
              title={f.link ? `A link to ${f.link}` : `${sizeOf(f.size)}${f.executable ? ", executable" : ""}`}
              className={`rounded-btn border px-1.5 py-0.5 transition-colors focus-visible:outline-offset-[-2px]! [--ink:var(--code-ink)] ${
                shown === f.path
                  ? "border-code-content-line text-code-ink"
                  : "border-transparent text-code-gutter hover:text-code-ink"
              }`}
            >
              {f.path}
              {f.executable && <span aria-label=" (executable)">*</span>}
              {f.link && <span className="text-code-gutter"> → {f.link}</span>}
            </button>
          </li>
        ))}
      </ul>
      {file && (
        <ScrollPre
          label={file.path}
          text={file.content ?? ""}
          className="slim-scroll mt-2 max-h-40 overflow-auto rounded-btn border border-code-content-line px-3 py-2 leading-5"
        >
          {file.link ? (
            <span className="text-code-gutter">A link to {file.link}.</span>
          ) : file.content === null ? (
            <span className="text-code-gutter">A binary file ({sizeOf(file.size)}).</span>
          ) : file.content === "" ? (
            <span className="text-code-gutter">(empty)</span>
          ) : (
            <>
              {language ? <Highlight code={file.content} language={language} /> : file.content}
              {file.clipped && <span className="text-code-gutter">{`\n… the rest of its ${sizeOf(file.size)} is in the run`}</span>}
            </>
          )}
        </ScrollPre>
      )}
    </div>
  );
}
