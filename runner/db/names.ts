import { createHash, randomBytes } from "node:crypto";
import type { Namespace } from "../config.ts";

/**
 * Every name the database layer makes (architecture §3.4, §4.5, §5.3). SQL and
 * admin scripts are filled only with identifiers that match IDENT and
 * passwords that match PASSWORD, both checked before they are substituted, so
 * nothing a learner or a template writes ever reaches a statement the runner
 * runs as a superuser.
 */

/** A role, database, or Mongo user the runner made: ws_ workspaces, ck_ checks, run_ runs, tpl_ templates. */
export const IDENT = /^(ws|ck|run|tpl|vf)_[a-z0-9_]{1,48}$/;
/** 32 hex characters, from 16 random bytes. */
export const PASSWORD = /^[0-9a-f]{32}$/;
/** A workspace id: "w" and 10 lowercase base32 characters (lib/workspace-id.mjs). */
export const WORKSPACE_ID = /^w[a-z2-7]{10}$/;

export function checkIdent(name: string): string {
  if (!IDENT.test(name)) throw new Error(`Refusing an unsafe database name: ${JSON.stringify(name)}`);
  return name;
}

export function checkPassword(password: string): string {
  if (!PASSWORD.test(password)) throw new Error("Refusing a password that isn't 32 hex characters.");
  return password;
}

export function newPassword(): string {
  return randomBytes(16).toString("hex");
}

/** The role and databases of one workspace: ws_<id>, and ws_<id>_test when the template asks for one. */
export function workspaceNames(id: string) {
  if (!WORKSPACE_ID.test(id)) throw new Error(`Not a workspace id: ${JSON.stringify(id)}`);
  return { role: `ws_${id}`, dev: `ws_${id}`, test: `ws_${id}_test` };
}

/** A throwaway database (and its role) for one check: ck_<id>_<n>. */
export function checkName(id: string): string {
  if (!WORKSPACE_ID.test(id)) throw new Error(`Not a workspace id: ${JSON.stringify(id)}`);
  return checkIdent(`ck_${id}_${randomBytes(3).toString("hex")}`);
}

/** A throwaway database (and its role) for one single-file test: run_<nonce>. */
export function runName(): string {
  return `run_${randomBytes(6).toString("hex")}`;
}

/** The name a database gets while a reset replaces it, until it is dropped. */
export function oldName(db: string): string {
  return checkIdent(`${db}_old${randomBytes(3).toString("hex")}`);
}

/** Matches the databases and roles a crash can leave behind. */
export const LEFTOVER = /^(ck|run)_|_old[0-9a-f]{6}$/;

/**
 * A workspace template's database: tpl_<course>_<template>_<checkpoint>_<hash8>.
 * The readable part is shortened to fit, and the hash keeps it unique.
 */
export function templateName(parts: { course: string; template: string; checkpoint?: string }, hash: string): string {
  const slug = [parts.course, parts.template, parts.checkpoint ?? "base"]
    .join("_")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 39)
    .replace(/_+$/, "");
  return checkIdent(`tpl_${slug || "t"}_${hex(hash).slice(0, 8)}`);
}

/** A lesson setup's template database: tpl_lesson_<hash12>. */
export function lessonTemplateName(hash: string): string {
  return checkIdent(`tpl_lesson_${hex(hash).slice(0, 12)}`);
}

/** The first characters of SHA-256 over the parts, each ended by a NUL. */
export function hashOf(...parts: string[]): string {
  const h = createHash("sha256");
  for (const p of parts) h.update(p).update("\0");
  return h.digest("hex");
}

function hex(value: string): string {
  if (!/^[0-9a-f]{8,}$/.test(value)) throw new Error(`Not a hex hash: ${JSON.stringify(value)}`);
  return value;
}

/**
 * Docker names. Learners' runners use the architecture's names (hu-postgres,
 * hu-mongo, hu-db). A verify runner gets its own server, network, and volumes
 * per port, so tests never touch another runner's databases.
 */
export function dockerNames(ns: Namespace, port: number) {
  const tail = ns === "verify" ? `-${port}` : "";
  const p = ns === "verify" ? "hv" : "hu";
  return {
    network: `${p}-db${tail}`,
    postgres: `${p}-postgres${tail}`,
    mongo: `${p}-mongo${tail}`,
    pgVolume: `${p}-pgdata${tail}`,
    mongoVolume: `${p}-mongodata${tail}`,
    tool: `${p}-dbtool`,
  };
}
