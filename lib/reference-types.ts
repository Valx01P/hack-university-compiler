/** The compiler's Reference panel content. Pure types, safe for client and
    server. Authoring guides: content/reference/AUTHORING.md and
    content/challenges/AUTHORING.md. */

export interface ReferenceCategory {
  id: string;
  title: string;
}

/** One cheatsheet section: a category, titled in the language's own terms. */
export interface ReferenceSection {
  id: string;
  title: string;
  md: string;
}

export type ChallengeDifficulty = "very-easy" | "easy" | "medium";

/** A challenge as one language sees it. */
export interface Challenge {
  id: string;
  title: string;
  category: string;
  difficulty: ChallengeDifficulty;
  statement: string;
  tests: { stdin?: string; output: string }[];
  hints: string[];
  /** SQL challenges: the tables and rows every run starts from. A test's
      stdin is more setup SQL on top. Empty for other languages. */
  setup: string;
  starter: string;
  solution: string;
}

export interface ReferenceData {
  categories: ReferenceCategory[];
  cheatsheet: ReferenceSection[];
  challenges: Challenge[];
}

export const DIFFICULTY_LABEL: Record<ChallengeDifficulty, string> = {
  "very-easy": "Very easy",
  easy: "Easy",
  medium: "Medium",
};
