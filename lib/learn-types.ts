/**
 * The shape of Learn mode content (content/learn/<lang>/*.json). Pure types,
 * safe for client and server. content/learn/AUTHORING.md documents the rules
 * behind each field, and scripts/verify-lessons.mjs enforces them.
 */

export interface LessonTest {
  stdin?: string;
  output: string;
}

export interface LessonExample {
  title: string;
  prompt: string;
  code: string;
  stdin?: string;
  output: string;
  explanation: string;
}

export interface LessonPractice {
  title: string;
  prompt: string;
  starter: string;
  solution: string;
  tests: LessonTest[];
  hints?: string[];
}

export interface LessonStep {
  title: string;
  body: string;
  example: LessonExample;
  practice: LessonPractice;
}

export interface Lesson {
  id: string;
  title: string;
  section: string;
  summary: string;
  intro: string;
  steps: LessonStep[];
  recap?: string;
}

/** A lesson as the lesson list sees it: no bodies, just what it shows. */
export interface LessonMeta {
  id: string;
  title: string;
  section: string;
  summary: string;
  /** Number of practice problems (one per step). */
  problems: number;
  /** Each step's title: the lesson's parts, in order. */
  parts: string[];
}

/** Just enough of a lesson to link into it: its id and how many parts it has. */
export interface LessonRef {
  id: string;
  parts: number;
}

export interface Course {
  language: string;
  title: string;
  description: string;
  sections: { title: string; lessons: LessonMeta[] }[];
}

/** Stable id of a lesson's practice problem, used for progress. */
export const problemId = (lessonId: string, step: number) => `${lessonId}/${step}`;

/** Every step of a lesson is its own page, a part. `part` counts from 1. */
export const partHref = (lang: string, lessonId: string, part: number) => `/${lang}/learn/${lessonId}/${part}`;
