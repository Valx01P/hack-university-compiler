// Types for lib/workspace-id.mjs (plain JavaScript, shared by the app, the browser, the runner, and the verifiers).
export const WORKSPACE_ID: RegExp;

export type ParsedScope = { kind: "compiler"; course: string } | { kind: "playground"; course: "playground" };

export function workspaceId(scope: string): string;
export function isScope(scope: string): boolean;
export function parseScope(scope: string): ParsedScope | null;
export function base32(bytes: Uint8Array): string;
export function sha256(bytes: Uint8Array): Uint8Array;
