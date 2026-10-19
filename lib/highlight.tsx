/**
 * Syntax highlighting for the lesson and cheatsheet code blocks. The
 * tokenizer lives in lib/tokenize.mjs (shared with the editors and the Node
 * verifiers); this turns its pieces into spans with `tok-*` classes, whose
 * colors are the editor's `--hl-*` variables, so blocks follow the code theme
 * and contrast level. Fences in an unknown language (or `text`, used for
 * expected output) render plain.
 */

import { commentPieces, type Token } from "@/lib/tokenize.mjs";

export { commentPieces, stripComments, tokenize, type Piece, type Token } from "@/lib/tokenize.mjs";

/**
 * Highlight source to React spans (server- and client-safe). Each comment,
 * with the line or spaces it would leave behind, sits in a `.code-cmt` span,
 * so the "code comments" setting can hide it with CSS before first paint.
 */
export function Highlight({
  code,
  language,
}: {
  code: string;
  language: string;
}) {
  const token = (p: Token, key: number) =>
    p.type ? (
      <span key={key} className={`tok-${p.type}`}>
        {p.text}
      </span>
    ) : (
      p.text
    );
  // Runs of pieces that hide together share one span.
  const out: React.ReactNode[] = [];
  const pieces = commentPieces(code, language);
  for (let i = 0; i < pieces.length; ) {
    if (!pieces[i].hide) {
      out.push(token(pieces[i], i));
      i++;
      continue;
    }
    const start = i;
    while (i < pieces.length && pieces[i].hide) i++;
    out.push(
      <span key={`c${start}`} className="code-cmt">
        {pieces.slice(start, i).map((p, k) => token(p, k))}
      </span>
    );
  }
  return <>{out}</>;
}
