import { existsSync, readFileSync } from "fs";
import path from "path";
import { getCourseDir } from "@/lib/learn";
import type { Lesson } from "@/lib/learn-types";
import type { WorkspaceProps } from "@/lib/workspace-types";
import { fileLanguage } from "@/lib/workspace-types";
import { checkpointLayers, layerSource } from "@/lib/workspace-layers.mjs";
import { resolveScope, workspaceProps } from "@/lib/workspaces";

/**
 * What a Learn part in the workspace format shows (architecture §6.6, §8.1):
 * its run examples and Your workspace as IDE tabs, each its own workspace,
 * and in the lesson column every example rendered statically (a tour's stops
 * with the code they point at, a run example's commands and transcript), so
 * reading never needs a container. Tours point at code by an anchor (the
 * text of a line), found here at build time. Server only.
 */

export interface TourStop {
  file: string;
  /** 1-based, where the anchor is (0 when it's gone). */
  line: number;
  code: string;
  language: string;
  note: string;
}

export interface TranscriptStep {
  cmd?: string;
  output?: string;
  exit?: number;
  http?: string;
  request?: string;
  response?: string;
}

export type WorkspaceExampleView =
  | { kind: "tour"; title: string; prompt?: string; explanation?: string; stops: TourStop[] }
  | {
      kind: "run";
      title: string;
      prompt?: string;
      explanation?: string;
      /** The tab that opens it ("" for example 1, ex2, ex3). */
      tab: string;
      open: { file: string; line: number }[];
      run: { cmd?: string; http?: string }[];
      transcript: TranscriptStep[] | null;
    };

export interface WorkspaceTab {
  /** The address's ?tab: "" (example 1), ex2, ex3, or code (Your workspace). */
  tab: string;
  label: string;
  props: WorkspaceProps;
}

export interface WorkspacePartData {
  tabs: WorkspaceTab[];
  examples: WorkspaceExampleView[];
  practice: {
    title: string;
    prompt: string;
    contract: string[];
    acceptance: string[];
    hints: string[];
    /** Files the practice opens first. */
    open: string[];
  };
}

interface RawExample {
  kind?: "tour" | "run";
  title: string;
  prompt?: string;
  explanation?: string;
  workspace?: { checkpoint?: string; overlay?: string };
  stops?: { file: string; anchor: string; lines?: number; note: string }[];
  open?: (string | { file: string; anchor?: string })[];
  run?: { cmd?: string; http?: string }[];
}

interface RawPractice {
  title: string;
  prompt: string;
  workspace?: { checkpoint?: string; open?: string[] };
  contract?: string[];
  checks?: { acceptance?: Record<string, string> };
  hints?: string[];
}

const ROOT = process.cwd();

/** A file of a stack of layers: the last layer that has it, unless a later
    one deletes it. */
function layerFile(course: string, template: string, layers: string[], file: string): string | null {
  let found: string | null = null;
  for (const layer of layers) {
    const { dir, deletes } = layerSource(ROOT, course, template, layer);
    if (deletes.some((d) => file === d || file.startsWith(`${d}/`))) found = null;
    const full = path.join(dir, file);
    if (existsSync(full)) found = full;
  }
  return found ? readFileSync(found, "utf8") : null;
}

/** The line an anchor is on (the first whose text holds it), from 1. */
function anchorLine(text: string, anchor: string): number {
  const want = anchor.trim();
  const lines = text.split("\n");
  const at = lines.findIndex((l) => l.includes(want));
  return at + 1;
}

export async function workspacePartData(course: string, lesson: Lesson, part: number): Promise<WorkspacePartData> {
  const step = lesson.steps[part];
  const examples = step.examples as unknown as RawExample[];
  const practice = step.practice as unknown as RawPractice;
  const n = part + 1;
  const tabs: WorkspaceTab[] = [];
  const views: WorkspaceExampleView[] = [];
  const runCount = examples.filter((e) => e.kind !== "tour").length;
  for (const [i, ex] of examples.entries()) {
    const k = i + 1;
    if (ex.kind === "tour") {
      // Tours read the template at their checkpoint (or the practice's).
      const resolved = await resolveScope(`learn/${course}/${lesson.id}/${n}/practice`);
      const { course: c, templateId } = resolved;
      const layers = ex.workspace?.checkpoint ? checkpointLayers(ROOT, c, templateId, ex.workspace.checkpoint) : resolved.layers;
      const stops = (ex.stops ?? []).map((stop) => {
        const text = layerFile(c, templateId, layers, stop.file) ?? "";
        const line = anchorLine(text, stop.anchor);
        const lines = text.split("\n");
        const code = line ? lines.slice(line - 1, line - 1 + Math.max(1, stop.lines ?? 8)).join("\n") : "";
        return { file: stop.file, line, code, language: fileLanguage(stop.file), note: stop.note };
      });
      views.push({ kind: "tour", title: ex.title, prompt: ex.prompt, explanation: ex.explanation, stops });
      continue;
    }
    const scope = `learn/${course}/${lesson.id}/${n}/example-${k}`;
    const props = await workspaceProps(scope);
    const tab = k === 1 ? "" : `ex${k}`;
    tabs.push({ tab, label: runCount > 1 || examples.length > 1 ? `Example ${k}` : "Example", props });
    const resolved = await resolveScope(scope);
    const open = (ex.open ?? []).map((o) => {
      const file = typeof o === "string" ? o : o.file;
      const anchor = typeof o === "string" ? undefined : o.anchor;
      const text = anchor ? layerFile(resolved.course, resolved.templateId, resolved.layers, file) : null;
      return { file, line: text && anchor ? anchorLine(text, anchor) : 0 };
    });
    const transcriptFile = path.join(await getCourseDir(course), lesson.id, `part-${n}`, `example-${k}`, "transcript.json");
    let transcript: TranscriptStep[] | null = null;
    if (existsSync(transcriptFile)) {
      try {
        transcript = (JSON.parse(readFileSync(transcriptFile, "utf8")) as { steps?: TranscriptStep[] }).steps ?? null;
      } catch {
        transcript = null;
      }
    }
    views.push({ kind: "run", title: ex.title, prompt: ex.prompt, explanation: ex.explanation, tab, open, run: ex.run ?? [], transcript });
  }
  const practiceProps = await workspaceProps(`learn/${course}/${lesson.id}/${n}/practice`);
  const open = practice.workspace?.open ?? [];
  if (open.length) practiceProps.template = { ...practiceProps.template, open: [...open] };
  tabs.push({ tab: "code", label: "Your workspace", props: practiceProps });
  return {
    tabs,
    examples: views,
    practice: {
      title: practice.title,
      prompt: practice.prompt,
      contract: practice.contract ?? [],
      acceptance: Object.values(practice.checks?.acceptance ?? {}),
      hints: practice.hints ?? [],
      open,
    },
  };
}
