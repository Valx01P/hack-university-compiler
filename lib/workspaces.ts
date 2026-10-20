import { existsSync, readFileSync } from "fs";
import path from "path";
import * as z from "zod";
import { getCourseEntry } from "@/lib/courses";
import { getCourseDir, getLesson } from "@/lib/learn";
import type { StartingTree, WorkspaceProps, WorkspaceTemplateInfo } from "@/lib/workspace-types";
import { isScope, parseScope, workspaceId } from "@/lib/workspace-id.mjs";
import { checkpointLayers, layerTree, listTemplates, readTemplate, sortedEntries, templateDir, treeHash } from "@/lib/workspace-layers.mjs";

/**
 * Server side of the workspaces: from a scope (where a workspace lives in
 * the app, lib/workspace-id.mjs) to its template, its layers, and the body
 * Next sends the runner to open it (architecture §3.5 and §4.2.1). The
 * browser only ever names a scope. Everything that runs (the image, the
 * tasks' commands, the layers, the check suite) comes from content/ here,
 * so no request can choose a command, an image, or a path.
 */

const ROOT = process.cwd();

// template.json (architecture §6.7). Fields this side doesn't use pass
// through to the runner untouched.
const Template = z.looseObject({
  id: z.string(),
  course: z.string(),
  title: z.string(),
  /** One or two sentences on what the codebase is and what it's for. */
  description: z.string().max(300).optional(),
  image: z.string().regex(/^[a-z][a-z0-9-]{0,31}$/),
  storage: z.enum(["host", "volume"]).default("host"),
  profile: z.enum(["standard", "sysadmin"]).default("standard"),
  layout: z.enum(["ide", "preview-first"]).default("ide"),
  start: z.enum(["run", "open"]).default("run"),
  examples: z.enum(["own", "shared"]).default("own"),
  /** The checkpoint a sandbox opens at (base when unset). */
  golden: z.string().optional(),
  services: z.record(z.string(), z.unknown()).default({}),
  ports: z.array(z.looseObject({ env: z.string(), label: z.string(), readyPath: z.string().optional(), preview: z.boolean().optional() })).default([]),
  tasks: z.record(z.string().regex(/^[a-z][a-z0-9-]{0,31}$/), z.looseObject({ cmd: z.string(), label: z.string().optional(), run: z.boolean().optional() })).default({}),
  env: z.record(z.string(), z.string()).default({}),
  deps: z.looseObject({ kind: z.string(), lock: z.string().optional(), mode: z.enum(["shared", "own"]).default("shared") }).optional(),
  build: z.array(z.string()).default([]),
  open: z.array(z.string()).default([]),
  requests: z.string().optional(),
  readonly: z.array(z.string()).default([]),
  hidden: z.array(z.string()).default([]),
  panels: z.array(z.string()).default(["terminal", "server", "ports", "problems", "results"]),
  diagnostics: z.array(z.unknown()).default([]),
  autosave: z.boolean().default(true),
  restartOnReset: z.boolean().default(false),
  limits: z.record(z.string(), z.number()).optional(),
});
export type Template = z.infer<typeof Template>;

export class ScopeError extends Error {}

/** A template by course and id, checked, or null. */
export function getTemplate(course: string, id: string): Template | null {
  const raw = readTemplate(ROOT, course, id);
  if (!raw) return null;
  const parsed = Template.safeParse(raw);
  if (!parsed.success) throw new Error(`content/workspaces/${course}/${id}/template.json: ${parsed.error.issues[0]?.message}`);
  return parsed.data;
}

/** The course's playground template id, when it has one on disk. */
export function playgroundTemplateOf(course: string): string | null {
  const ref = getCourseEntry(course)?.playground;
  if (!ref) return null;
  const [owner, id] = ref.split("/");
  return owner === course && id && templateDir(ROOT, course, id) ? id : null;
}

/** Templates a course's playground menu offers as sandboxes. */
export function sandboxTemplates(course: string): { id: string; title: string }[] {
  return listTemplates(ROOT, course)
    .map((id: string) => ({ id, title: getTemplate(course, id)?.title ?? id }))
    .filter((t: { id: string }) => !/^\d+$/.test(t.id));
}

/** Where a scope's files start: its template and the layers on top. */
export interface ResolvedScope {
  scope: string;
  id: string;
  course: string;
  templateId: string;
  template: Template;
  layers: string[];
  /** A check suite (relative to content/) Check runs, when there is one. */
  suite: string | null;
}

// Content is read where it lies (next start runs in the repository), so none
// of these paths needs tracing into the build output.
const exists = (...parts: string[]) => existsSync(path.join(/*turbopackIgnore: true*/ ROOT, ...parts));

/** Resolves a scope to its template and layers, or throws ScopeError. */
export async function resolveScope(scope: string): Promise<ResolvedScope> {
  if (!isScope(scope)) throw new ScopeError("That isn't a workspace.");
  const parsed = parseScope(scope)!;
  const course = parsed.course;
  if (!getCourseEntry(course)) throw new ScopeError("There's no such course.");
  const done = (templateId: string, checkpoint: string | undefined, extra: string[], suite: string | null): ResolvedScope => {
    const template = getTemplate(course, templateId);
    if (!template) throw new ScopeError(`There's no ${templateId} codebase.`);
    let layers: string[];
    try {
      layers = [...checkpointLayers(ROOT, course, templateId, checkpoint ?? template.golden), ...extra];
    } catch (err) {
      throw new ScopeError(err instanceof Error ? err.message : String(err));
    }
    return { scope, id: workspaceId(scope), course, templateId, template, layers, suite };
  };
  switch (parsed.kind) {
    case "playground": {
      const id = playgroundTemplateOf(course);
      if (!id) throw new ScopeError("This course has no playground yet.");
      // Playgrounds and sandboxes are for trying things: no checks. (A
      // template's own suite, checks/template, is for verify-templates.)
      return done(id, undefined, [], null);
    }
    case "sandbox":
      return done(parsed.template, undefined, [], null);
    case "challenge": {
      const file = path.join(/*turbopackIgnore: true*/ ROOT, "content", "challenges", course, `${parsed.challenge}.json`);
      if (!existsSync(file)) throw new ScopeError("There's no such challenge.");
      const challenge = JSON.parse(readFileSync(file, "utf8")) as { template?: string; checkpoint?: string };
      if (!challenge.template) throw new ScopeError("That challenge has no codebase.");
      const starter = exists("content", "challenges", course, parsed.challenge, "starter") ? [`@challenges/${course}/${parsed.challenge}/starter`] : [];
      const suite = exists("content", "challenges", course, parsed.challenge, "checks", "suite.json") ? `challenges/${course}/${parsed.challenge}/checks` : null;
      return done(challenge.template, challenge.checkpoint, starter, suite);
    }
    case "learn": {
      const found = await getLesson(course, parsed.lesson);
      // Read lessons have no workspace: their codebases open as sandboxes.
      const lesson = found && found.format !== "read" ? found : null;
      const lessons = await getCourseDir(course);
      const step = lesson?.steps[parsed.part - 1];
      if (!lesson || !step) throw new ScopeError("There's no such part.");
      const templateId = lesson.template;
      if (!templateId) throw new ScopeError("That part has no codebase.");
      const partDir = `${parsed.lesson}/part-${parsed.part}`;
      // The part's own folder: content/learn/<course>/<lesson>/part-<n>, or a draft's.
      const here = (...more: string[]) => existsSync(path.join(/*turbopackIgnore: true*/ lessons, parsed.lesson, `part-${parsed.part}`, ...more));
      if (parsed.tab === "practice") {
        const practice = step.practice as unknown as { workspace?: { checkpoint?: string } };
        const starter = here("practice", "starter") ? [`@learn/${course}/${partDir}/practice/starter`] : [];
        const suite = here("practice", "checks", "suite.json") ? `learn/${course}/${partDir}/practice/checks` : null;
        return done(templateId, practice.workspace?.checkpoint, starter, suite);
      }
      // A run example's own workspace, or (in templates that share one) the
      // part's examples workspace, which starts as its first run example.
      const examples = step.examples as unknown as { kind?: string; workspace?: { checkpoint?: string; overlay?: string } }[];
      const example = parsed.tab === "examples" ? examples.find((e) => e.kind !== "tour") : examples[(parsed.example ?? 1) - 1];
      if (!example || example.kind === "tour") throw new ScopeError("That example has no workspace.");
      const k = examples.indexOf(example) + 1;
      const overlay = example.workspace?.overlay;
      const extra = !overlay
        ? here(`example-${k}`)
          ? [`@learn/${course}/${partDir}/example-${k}`]
          : []
        : overlay.startsWith("examples/")
          ? [overlay]
          : [`@learn/${course}/${partDir}/${overlay}`];
      return done(templateId, example.workspace?.checkpoint, extra, null);
    }
  }
}

/** The body of PUT /v1/workspaces/:id (architecture §3.5): everything the
    runner needs to open the workspace, all of it from content. */
export function runnerOpenBody(r: ResolvedScope) {
  const t = r.template;
  let lockHash: string | undefined;
  if (t.deps?.lock) {
    const tree = layerTree(ROOT, r.course, r.templateId, r.layers);
    const lock = tree.get(t.deps.lock);
    lockHash = lock?.sha256?.slice(0, 12);
  }
  return {
    scope: r.scope,
    template: `${r.course}/${r.templateId}`,
    course: r.course,
    layers: r.layers,
    image: t.image,
    storage: t.storage,
    profile: t.profile,
    start: t.start,
    examples: t.examples,
    ports: t.ports.map((p) => ({ env: p.env, label: p.label, ...(p.readyPath ? { readyPath: p.readyPath } : {}), ...(p.preview ? { preview: true } : {}) })),
    services: t.services,
    ...(t.deps ? { deps: { mode: t.deps.mode, kind: t.deps.kind, ...(t.deps.lock ? { lock: t.deps.lock } : {}), ...(lockHash ? { lockHash } : {}) } } : {}),
    build: t.build,
    tasks: Object.fromEntries(
      Object.entries(t.tasks).map(([name, task]) => [name, { cmd: task.cmd, ...(task.label ? { label: task.label } : {}), ...(task.run ? { run: true } : {}) }])
    ),
    env: t.env,
    hidden: t.hidden,
    readonly: t.readonly,
    restartOnReset: t.restartOnReset,
    diagnostics: t.diagnostics,
    ...(t.limits ? { limits: t.limits } : {}),
  };
}

/** What the IDE may know about a template: no commands it could send back
    (it shows them, and only names tasks). */
export function templateInfo(r: Pick<ResolvedScope, "course" | "templateId" | "template" | "suite">): WorkspaceTemplateInfo {
  const t = r.template;
  const tasks = Object.entries(t.tasks).map(([name, task]) => ({ name, label: task.label ?? name, cmd: task.cmd, run: Boolean(task.run) }));
  // Run starts the task the template marks, else dev, else start.
  if (tasks.length && !tasks.some((task) => task.run)) {
    const first = tasks.find((task) => task.name === "dev") ?? tasks.find((task) => task.name === "start");
    if (first) first.run = true;
  }
  const open = t.open.length ? t.open : [];
  return {
    id: `${r.course}/${r.templateId}`,
    title: t.title,
    description: t.description ?? null,
    layout: t.layout,
    start: t.start,
    storage: t.storage,
    tasks,
    ports: t.ports.map((p) => ({ env: p.env, label: p.label, readyPath: p.readyPath, preview: p.preview })),
    open: open.includes("README.md") || !exists("content", "workspaces", r.course, r.templateId, "base", "README.md") ? open : ["README.md", ...open],
    requests: t.requests ?? null,
    readonly: t.readonly,
    hidden: t.hidden,
    panels: t.panels,
    autosave: t.autosave,
    services: Object.keys(t.services),
    checks: Boolean(r.suite),
  };
}

/** The tree a scope's IDE paints first: its layers' starting files. The
    build writes the template's checkpoints to .generated/workspaces, and a
    scope with lesson or challenge overlays on top is computed the same way
    (pages are prerendered, so either way this runs at build time). */
export function startingTree(r: Pick<ResolvedScope, "course" | "templateId" | "layers">): StartingTree {
  const plain = r.layers.every((l) => l === "base" || l.startsWith("checkpoints/"));
  const cp = r.layers.length > 1 ? r.layers[r.layers.length - 1].slice("checkpoints/".length) : "base";
  const built = path.join(/*turbopackIgnore: true*/ ROOT, ".generated", "workspaces", r.course, r.templateId, `${cp}.json`);
  if (plain && existsSync(built)) {
    const data = JSON.parse(readFileSync(built, "utf8")) as StartingTree;
    return { hash: data.hash, entries: data.entries };
  }
  const tree = layerTree(ROOT, r.course, r.templateId, r.layers);
  return { hash: treeHash(tree), entries: sortedEntries(tree) };
}

/** Everything a page gives its IDE for a scope. */
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

