import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { exists, sha256 } from "./fs.ts";

export interface CrewPaths {
  root: string;
  crewDir: string;
  localDir: string;
  userDir: string;
  integrityFile: string;
  repoId: string;
}

/**
 * The absolute path with every symbolic link resolved, so that a folder has one name whatever
 * alias it was reached by (on macOS `/tmp` is `/private/tmp`). A part that does not exist yet is
 * kept as written under its nearest existing ancestor.
 */
export function canonical(path: string): string {
  const abs = resolve(path);
  const tail: string[] = [];
  let dir = abs;
  for (;;) {
    try {
      return join(realpathSync(dir), ...tail);
    } catch {
      const parent = dirname(dir);
      if (parent === dir) return abs;
      tail.unshift(basename(dir));
      dir = parent;
    }
  }
}

/**
 * The project root: the nearest ancestor (or the folder itself) that holds `.git`, else the folder
 * itself when it already holds `.crew/` (activated by `crew detect`), else null: crew is inactive.
 */
export function findRoot(cwd: string): string | null {
  const start = canonical(cwd);
  let dir = start;
  for (;;) {
    if (exists(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return exists(join(start, ".crew")) ? start : null;
}

/** Where the user's own state lives; it does not depend on any project. */
export function userDirOf(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.WIZARDINGCODE_HOME ?? join(homedir(), ".wizardingcode"), "crew");
}

export function resolvePaths(cwd: string, env: NodeJS.ProcessEnv = process.env): CrewPaths | null {
  const root = findRoot(cwd);
  if (root === null) return null;
  return pathsFor(root, canonical(userDirOf(env)));
}

/** The paths of a project root already known (a registered project read from another one), under the same user directory. */
export function pathsFor(root: string, userDir: string): CrewPaths {
  const repoId = sha256(root).slice(0, 16);
  return {
    root,
    crewDir: join(root, ".crew"),
    localDir: join(root, ".crew", "local"),
    userDir,
    integrityFile: join(userDir, "integrity", `${repoId}.json`),
    repoId,
  };
}

export function workDir(paths: CrewPaths, id: string): string {
  return join(paths.crewDir, "work", id);
}

/** The projects the engine has seen, for mail (SP2c §6). */
export function registryPath(userDir: string): string {
  return join(userDir, "projects.json");
}

/** A project's mailbox: its inbox, its outbox, the long bodies and the opened sessions' logs. */
export function mailboxDir(userDir: string, workspace: string | null, project: string): string {
  return join(userDir, "mail", workspace ?? "_alone", project);
}

const PROTECTED_TOP = new Set([
  ".crew/profile.json",
  ".crew/policy.json",
  ".crew/.gitignore",
  // The project's decision register (SP7 §6.6): appended by the engine at every decision.
  ".crew/decisions.json",
]);
/** The files of a work folder only the engine writes; `crew accept <id>` re-trusts the same set. */
export const PROTECTED_WORK_FILES: readonly string[] = [
  "work.json",
  "evidence.json",
  "report.md",
  "objections.json",
  "mail.json",
];
const PROTECTED_IN_WORK = new Set(PROTECTED_WORK_FILES);
/** The one source of what stays the session's under `review/` (SP7b decision 16): `ui` or `e2e`, right under it or under a todo's `T-n/`; the hook's text rule builds on it too. */
export const REVIEW_OPEN_SEGMENT = String.raw`(?:T-\d+\/)?(?:ui|e2e)`;
const REVIEW_OPEN = new RegExp(String.raw`^review\/${REVIEW_OPEN_SEGMENT}(?:\/|$)`);

/** Files only the engine writes. The agent is denied direct writes to them. */
export function isProtectedPath(paths: CrewPaths, absPath: string): boolean {
  const abs = canonical(absPath);
  if (abs === paths.userDir || abs.startsWith(paths.userDir + sep)) return true;
  const rel = relative(paths.root, abs).replace(/\\/g, "/");
  if (rel.startsWith("..") || rel === "") return false;
  if (PROTECTED_TOP.has(rel)) return true;
  if (rel === ".crew/local" || rel.startsWith(".crew/local/")) return true;
  const inWork = /^\.crew\/work\/[^/]+\/(.+)$/.exec(rel);
  if (!inWork) return false;
  const inner = inWork[1] ?? "";
  // The review folder is the engine's (the reviewers' answers, the rulings, the round copies, the
  // inputs), except the folders the session fills with captures and the e2e run writes.
  if (inner === "review" || inner.startsWith("review/")) return !REVIEW_OPEN.test(inner);
  return PROTECTED_IN_WORK.has(inner) || inner.startsWith("logs/");
}
