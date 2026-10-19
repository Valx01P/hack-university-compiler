// Types for lib/bash-tokens.mjs (plain JavaScript so the Node verifiers and tests can use it).
import type { Token } from "./tokenize.mjs";

export function bashTokens(code: string, patterns?: number[] | null): Token[];
