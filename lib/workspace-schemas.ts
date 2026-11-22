import * as z from "zod";
import { isScope, WORKSPACE_ID } from "@/lib/workspace-id.mjs";

/**
 * The bodies and queries the workspace routes accept from the browser
 * (architecture §3.1): relative, normalized paths (no NUL, no "." or ".."
 * segment, at most 4,096 bytes overall and 255 per segment), and numbers in
 * range. The runner checks them again with its own schemas.
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

const Mode = z.number().int().min(0).max(0o7777);
/** What a delete answers (`undo`), to put it back. */
const UndoToken = z.string().regex(/^[a-z0-9]{8,40}$/, "isn't an undo token");

export const FsRequest = z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("mkdir"), path: RelPath }),
  z.strictObject({ op: z.literal("rename"), path: RelPath, to: RelPath }),
  z.strictObject({ op: z.literal("copy"), path: RelPath, to: RelPath }),
  z.strictObject({ op: z.literal("delete"), path: RelPath }),
  z.strictObject({ op: z.literal("chmod"), path: RelPath, mode: Mode }),
  z.strictObject({ op: z.literal("restore"), undo: UndoToken }),
]);

/** A file or a folder back to the starting point. */
export const ResetRequest = z.strictObject({ scope: z.enum(["file", "dir"]), path: RelPath, dryRun: z.boolean().optional() });

export const TerminalRequest = z.strictObject({
  cols: z.number().int().min(2).max(1000),
  rows: z.number().int().min(2).max(500),
  cwd: RelPath.optional(),
});

/** A short, readable list of what was wrong with a body. */
export function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
    .join("; ");
}
