import { existsSync, readFileSync } from "fs";
import path from "path";
import * as z from "zod";
import { getCourseEntry } from "@/lib/courses";
import type { StartingTree, WorkspaceProps, WorkspaceTemplateInfo } from "@/lib/workspace-types";
import { isScope, parseScope, workspaceId } from "@/lib/workspace-id.mjs";
import { checkpointLayers, layerTree, readTemplate, sortedEntries, treeHash } from "@/lib/workspace-layers.mjs";

/**
 * Server side of the workspaces: from a scope (where a workspace lives in
 * the app, lib/workspace-id.mjs) to its template, its layers, and the body
 * Next sends the runner to open it (architecture §3.5 and §4.2.1). The
 * browser only ever names a scope. The template and its layers come from
 * content/ here, so no request can choose a path. Every workspace is a
 * folder on this computer: a compiler's own (compiler/<course>, template
 * content/workspaces/<course>/compiler) or the playground's (playground,
 * template content/workspaces/playground/blank).
 */

const ROOT = process.cwd();

// template.json (architecture §6.7). Fields this side doesn't use are let
// through and never sent on.
const Template = z.looseObject({
  id: z.string(),
  course: z.string(),
  title: z.string(),
  /** One or two sentences on what the folder is and what it's for. */
  description: z.string().max(300).optional(),
  storage: z.literal("host").default("host"),
  /** Its terminals run on this computer (the runner keeps that to these
      folders, runner/workspaces.ts shellPlace). */
  shell: z.literal("host").default("host"),
  open: z.array(z.string()).default([]),
  readonly: z.array(z.string()).default([]),
  hidden: z.array(z.string()).default([]),
  autosave: z.boolean().default(true),
});
export type Template = z.infer<typeof Template>;

export class ScopeError extends Error {}

/** A template by owner (a course, or "playground") and id, checked, or null. */
export function getTemplate(course: string, id: string): Template | null {
  const raw = readTemplate(ROOT, course, id);
  if (!raw) return null;
  const parsed = Template.safeParse(raw);
  if (!parsed.success) throw new Error(`content/workspaces/${course}/${id}/template.json: ${parsed.error.issues[0]?.message}`);
  return parsed.data;
}

/** The template of a compiler page's own folder (compiler/<course> scopes). */
export const COMPILER_TEMPLATE = "compiler";
/** The playground's owner (in place of a course) and template. */
export const PLAYGROUND = { course: "playground", template: "blank" } as const;

/** Where a scope's files start: its template and the layers on top. */
export interface ResolvedScope {
  scope: string;
  id: string;
  /** The course, or "playground". */
  course: string;
  templateId: string;
  template: Template;
  layers: string[];
}

// Content is read where it lies (next start runs in the repository), so none
// of these paths needs tracing into the build output.
const exists = (...parts: string[]) => existsSync(path.join(/*turbopackIgnore: true*/ ROOT, ...parts));

/** Resolves a scope to its template and layers, or throws ScopeError. */
export async function resolveScope(scope: string): Promise<ResolvedScope> {
  if (!isScope(scope)) throw new ScopeError("That isn't a workspace.");
  const parsed = parseScope(scope)!;
  const done = (course: string, templateId: string): ResolvedScope => {
    const template = getTemplate(course, templateId);
    if (!template) throw new ScopeError(`There's no ${course}/${templateId} folder.`);
    let layers: string[];
    try {
      layers = checkpointLayers(ROOT, course, templateId, undefined);
    } catch (err) {
      throw new ScopeError(err instanceof Error ? err.message : String(err));
    }
    return { scope, id: workspaceId(scope), course, templateId, template, layers };
  };
  // The one playground: no course, no checks, a folder for trying anything.
  if (parsed.kind === "playground") return done(PLAYGROUND.course, PLAYGROUND.template);
  // A compiler page's own folder: one per language, never a challenge's.
  if (!getCourseEntry(parsed.course)?.page) throw new ScopeError("This course has no compiler.");
  return done(parsed.course, COMPILER_TEMPLATE);
}

/** The body of PUT /v1/workspaces/:id (architecture §3.5): everything the
    runner needs to open the folder, all of it from content. */
export function runnerOpenBody(r: ResolvedScope) {
  const t = r.template;
  return {
    scope: r.scope,
    template: `${r.course}/${r.templateId}`,
    course: r.course,
    layers: r.layers,
    storage: t.storage,
    shell: t.shell,
    hidden: t.hidden,
    readonly: t.readonly,
  };
}

/** What the page may know about a template. */
export function templateInfo(r: Pick<ResolvedScope, "course" | "templateId" | "template">): WorkspaceTemplateInfo {
  const t = r.template;
  const open = t.open.length ? t.open : [];
  return {
    id: `${r.course}/${r.templateId}`,
    title: t.title,
    description: t.description ?? null,
    open: open.includes("README.md") || !exists("content", "workspaces", r.course, r.templateId, "base", "README.md") ? open : ["README.md", ...open],
    readonly: t.readonly,
    hidden: t.hidden,
    autosave: t.autosave,
  };
}

/** The tree a scope's folder paints first: its template's starting files.
    The build writes them to .generated/workspaces (pages are prerendered,
    so this runs at build time), else they're computed the same way. */
export function startingTree(r: Pick<ResolvedScope, "course" | "templateId" | "layers">): StartingTree {
  const built = path.join(/*turbopackIgnore: true*/ ROOT, ".generated", "workspaces", r.course, r.templateId, "base.json");
  if (r.layers.length === 1 && existsSync(built)) {
    const data = JSON.parse(readFileSync(built, "utf8")) as StartingTree;
    return { hash: data.hash, entries: data.entries };
  }
  const tree = layerTree(ROOT, r.course, r.templateId, r.layers);
  return { hash: treeHash(tree), entries: sortedEntries(tree) };
}

/** Everything a page gives its folder for a scope. */
export async function workspaceProps(scope: string): Promise<WorkspaceProps> {
  const r = await resolveScope(scope);
  return {
    scope,
    id: r.id,
    course: r.course,
    template: templateInfo(r),
    tree: startingTree(r),
    compilerHref: getCourseEntry(r.course)?.page ? `/${r.course}` : null,
  };
}
