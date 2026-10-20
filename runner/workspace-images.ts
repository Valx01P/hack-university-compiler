import { readFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./config.ts";

/**
 * Which image and limits a workspace gets (architecture §2.4, §11.3), from
 * one table keyed by the course's runtime in content/courses.json. Content
 * never names an image beyond the template's `image` field (§6.7), which can
 * only pick another image from the same list.
 *
 * The images lane adds each stack's image to IMAGES in images.ts. Until then
 * a course whose image isn't registered opens its workspaces (files work) and
 * answers image_missing at start.
 */

const MiB = 1024 * 1024;

/** Every image a template may name (template.json `image`). */
export const WORKSPACE_IMAGE_NAMES = ["node", "bash", "web", "check-web", "python", "java", "go"] as const;
export type WorkspaceImageName = (typeof WORKSPACE_IMAGE_NAMES)[number];

/** The image for each runtime in content/courses.json. */
export const RUNTIME_IMAGES: Record<string, WorkspaceImageName> = {
  "runner:typescript": "node",
  "runner:bash": "bash",
  "runner:express": "web",
  "runner:nextjs": "web",
  "runner:fastapi": "python",
  "runner:go": "go",
  "runner:spring": "java",
  browser: "web",
};

/** A course whose image isn't the one its runtime implies goes here. */
export const COURSE_IMAGES: Record<string, WorkspaceImageName> = {};

/**
 * Images a template may name that the runner doesn't build yet, and what
 * their workspaces run in meanwhile: hu/check-web (hu/web and Chromium, for
 * end-to-end tests and DOM checks) arrives with the web checks, and the rest
 * of a web project (its dev server, unit tests, and builds) runs in hu/web.
 */
export const STAND_INS: Partial<Record<WorkspaceImageName, WorkspaceImageName>> = { "check-web": "web" };

/** The image a workspace's containers actually run: its own, or its stand-in until that exists. */
export function runnableImage(name: string | null): string | null {
  return (name && STAND_INS[name as WorkspaceImageName]) || name;
}

export interface WorkspaceLimits {
  memoryBytes: number;
  cpus: number;
  pids: number;
  fsizeBytes: number;
  tmpBytes: number;
  /** The reserved check slot while this course is open in a visible tab (§4.7). */
  checkBytes: number;
}

const BASE: WorkspaceLimits = { memoryBytes: 1024 * MiB, cpus: 2, pids: 512, fsizeBytes: 512 * MiB, tmpBytes: 256 * MiB, checkBytes: 1024 * MiB };

/** §11.3, per course. */
export const COURSE_LIMITS: Record<string, WorkspaceLimits> = {
  typescript: BASE,
  bash: { memoryBytes: 512 * MiB, cpus: 1, pids: 256, fsizeBytes: 256 * MiB, tmpBytes: 256 * MiB, checkBytes: 512 * MiB },
  express: BASE,
  web: { ...BASE, memoryBytes: 1536 * MiB, checkBytes: 1536 * MiB },
  react: { ...BASE, memoryBytes: 1536 * MiB, checkBytes: 1536 * MiB },
  nextjs: { ...BASE, memoryBytes: 2048 * MiB, checkBytes: 2048 * MiB },
  fastapi: { ...BASE, pids: 256 },
  "go-api": { ...BASE, memoryBytes: 1536 * MiB, tmpBytes: 512 * MiB, checkBytes: 2048 * MiB },
  spring: { ...BASE, memoryBytes: 1536 * MiB, checkBytes: 2048 * MiB },
};

interface CourseEntry {
  slug: string;
  runtime: string;
}

let courses: Map<string, CourseEntry> | null = null;

function registry(): Map<string, CourseEntry> {
  if (!courses) {
    const json = JSON.parse(readFileSync(path.join(ROOT, "content", "courses.json"), "utf8")) as { courses: CourseEntry[] };
    courses = new Map(json.courses.map((c) => [c.slug, c]));
  }
  return courses;
}

export function isCourse(slug: string): boolean {
  return registry().has(slug);
}

/** The image a course's workspaces use, or the template's choice when it makes one. */
export function workspaceImage(course: string, templateImage?: string): WorkspaceImageName | null {
  if (templateImage) return (WORKSPACE_IMAGE_NAMES as readonly string[]).includes(templateImage) ? (templateImage as WorkspaceImageName) : null;
  if (COURSE_IMAGES[course]) return COURSE_IMAGES[course];
  const runtime = registry().get(course)?.runtime;
  return runtime ? (RUNTIME_IMAGES[runtime] ?? null) : null;
}

/** The course's limits, lowered (never raised) by the template's. */
export function workspaceLimits(course: string, lower: { memoryMb?: number; cpus?: number; pids?: number } = {}): WorkspaceLimits {
  const base = COURSE_LIMITS[course] ?? BASE;
  return {
    ...base,
    memoryBytes: Math.min(base.memoryBytes, (lower.memoryMb ?? Infinity) * MiB),
    cpus: Math.min(base.cpus, lower.cpus ?? Infinity),
    pids: Math.min(base.pids, lower.pids ?? Infinity),
  };
}
