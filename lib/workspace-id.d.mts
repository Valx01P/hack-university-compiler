// Types for lib/workspace-id.mjs (plain JavaScript, shared by the app, the browser, the runner, and the verifiers).
export const SCRATCH_SLOTS: number;
export const WORKSPACE_ID: RegExp;

export type ParsedScope =
  | { kind: "learn"; course: string; lesson: string; part: number; tab: "practice" | "examples" | `example-${1 | 2 | 3}`; example?: number }
  | { kind: "challenge"; course: string; challenge: string }
  | { kind: "playground"; course: string; slot?: number }
  | { kind: "sandbox"; course: string; template: string };

export function workspaceId(scope: string): string;
export function isScope(scope: string): boolean;
export function parseScope(scope: string): ParsedScope | null;
export function scopeForRoute(pathname: string, options?: { tab?: string; shared?: boolean }): string | null;
export function routeForScope(scope: string): { pathname: string; tab: string } | null;
export function base32(bytes: Uint8Array): string;
export function sha256(bytes: Uint8Array): Uint8Array;
