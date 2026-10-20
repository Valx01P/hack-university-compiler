// Types for lib/workspace-id.mjs (plain JavaScript so the runner, the
// verifiers, and Next.js share it).

/** A workspace id: "w" and 10 lowercase base32 characters. */
export const WORKSPACE_ID: RegExp;
export function isScope(scope: unknown): scope is string;
export function workspaceId(scope: string): string;

export type ParsedScope =
  | { kind: "learn"; course: string; lesson: string; part: number; tab: "practice" | "examples" | "example"; example: number | null }
  | { kind: "challenge"; course: string; challenge: string }
  | { kind: "playground"; course: string; slot: number | null }
  | { kind: "sandbox"; course: string; template: string };

export function parseScope(scope: string): ParsedScope | null;
export function playgroundScope(course: string, slot?: string | number | null): string;
export function learnScope(course: string, lesson: string, part: number, tab: string): string;
