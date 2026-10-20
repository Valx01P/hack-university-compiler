import * as z from "zod";
import { isScope, WORKSPACE_ID } from "@/lib/workspace-id.mjs";

/**
 * The bodies and queries the workspace routes accept from the browser
 * (architecture §3.1): relative, normalized paths (no NUL, no "." or ".."
 * segment, at most 4,096 bytes overall and 255 per segment), names from
 * content (tasks, snapshots), and numbers in range. The runner checks them
 * again with its own schemas.
 */

const bytes = (s: string) => new TextEncoder().encode(s).length;

/** A path inside the workspace, relative to its root. */
export const RelPath = z
  .string()
  .min(1)
  .refine((p) => bytes(p) <= 4096, "is longer than 4,096 bytes")
  .refine((p) => !p.includes("\0"), "contains a NUL byte")
  .refine((p) => !p.startsWith("/"), "must be relative")
  .refine((p) => p.split("/").every((s) => s !== "" && s !== "." && s !== ".." && bytes(s) <= 255), 'has an empty, ".", "..", or over-long segment');

export const Scope = z.string().refine((s) => isScope(s), "isn't a workspace");
export const WorkspaceIdSchema = z.string().regex(WORKSPACE_ID, "isn't a workspace id");

export const OpenRequest = z.strictObject({ scope: Scope });

export const TicketRequest = z
  .strictObject({
    workspace: WorkspaceIdSchema,
    kind: z.enum(["events", "term"]),
    sid: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/, "isn't a terminal session id").optional(),
  })
  .refine((t) => (t.kind === "term") === (t.sid !== undefined), "a term ticket needs a sid, and only it does");

export const FsRequest = z
  .strictObject({
    op: z.enum(["mkdir", "rename", "delete", "copy", "chmod", "restore"]),
    path: RelPath,
    to: RelPath.optional(),
    mode: z.number().int().min(0).max(0o777).optional(),
  })
  .refine((r) => (r.op === "rename" || r.op === "copy") === (r.to !== undefined), "rename and copy need a destination, and only they do")
  .refine((r) => (r.op === "chmod") === (r.mode !== undefined), "chmod needs a mode, and only it does");

export const ResetRequest = z
  .strictObject({ scope: z.enum(["file", "dir", "all", "db", "everything"]), path: RelPath.optional() })
  .refine((r) => (r.scope === "file" || r.scope === "dir") === (r.path !== undefined), "file and dir resets name a path, and only they do");

export const SnapshotRequest = z.strictObject({ label: z.string().trim().min(1).max(80).optional() });
export const CarryRequest = z.strictObject({ from: Scope });
export const TerminalRequest = z.strictObject({
  cols: z.number().int().min(2).max(1000),
  rows: z.number().int().min(2).max(500),
  cwd: RelPath.optional(),
});
export const PortRequest = z.strictObject({ port: z.number().int().min(1).max(65535) });

const HeaderName = z.string().regex(/^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,128}$/, "isn't a header name");
export const HttpRequest = z.strictObject({
  port: z.number().int().min(1).max(65535),
  method: z.enum(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]),
  path: z.string().min(1).max(8192).startsWith("/").refine((p) => !/[\r\n\0]/.test(p), "has a line break"),
  headers: z
    .record(HeaderName, z.string().max(16_384).refine((v) => !/[\r\n\0]/.test(v), "has a line break"))
    .refine((h) => Object.keys(h).length <= 64, "has more than 64 headers")
    .default({}),
  body: z.string().max(1_000_000).optional(),
  jar: z.boolean().default(true),
});

export const DbQuery = z.union([
  z.strictObject({ sql: z.string().min(1).max(100_000) }),
  z.strictObject({ collection: z.string().min(1).max(120), filter: z.record(z.string(), z.unknown()).default({}), limit: z.number().int().min(1).max(500).default(50) }),
]);

export const CheckRequest = z.strictObject({ scope: Scope });

/** A short, readable list of what was wrong with a body. */
export function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
    .join("; ");
}
