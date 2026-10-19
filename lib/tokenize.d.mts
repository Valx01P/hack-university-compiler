// Types for lib/tokenize.mjs (plain JavaScript so the Node verifiers and tests can use it).
export interface Token {
  /** The `tok-*` class it gets, or null for plain text. */
  type: string | null;
  text: string;
}

export interface Piece extends Token {
  /** Part of what hiding comments removes. */
  hide: boolean;
}

/** A language's own id, from any of its names (`ts`, `sh`, `py`). */
export function languageId(language: string): string;
export function tokenize(code: string, language: string): Token[];
export function commentPieces(code: string, language: string): Piece[];
export function stripComments(code: string, language: string): string;
