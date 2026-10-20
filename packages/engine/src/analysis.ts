import { existsSync, lstatSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { listDecisions } from "./decisions.ts";
import { loadEvidence } from "./evidence.ts";
import { isGitRepo } from "./fingerprint.ts";
import { nowIso } from "./fs.ts";
import { loadItemMail } from "./mail.ts";
import { type CrewPaths, workDir } from "./paths.ts";
import { readProtectedJson, writeProtectedJson } from "./store.ts";
import type { KnownRootCause, WorkKind } from "./types.ts";
import { kindOfItem, loadWork } from "./work.ts";
import { gitRun } from "./worktree.ts";

/** One commit that touched a path (SP7 §7.4): when, by whom, how many lines the blame still attributes to it, and the items whose artifacts it carried. */
export interface OriginCommit {
  sha: string;
  at: string;
  author: string;
  lines: number;
  items: string[];
}

export interface OriginPath {
  path: string;
  commits: OriginCommit[];
}

/** An item named by a commit, summarised from the records at HEAD; null fields when the folder is gone. */
export interface OriginItem {
  id: string;
  title: string | null;
  kind: WorkKind | null;
  roles: string[];
  tasks: string[];
  decisions: number;
  mail: number;
}

/** Where the lines a defect touches came from (SP7 §7.4, rule 11): `analysis/origin.json`. */
export interface Origin {
  at: string;
  paths: OriginPath[];
  items: OriginItem[];
  note?: string;
  /** The base's root causes on these paths (SP4 Task 5, rule 17); absent on a record written before 0.10.0. */
  knownRootCauses?: KnownRootCause[];
}

/** The newest commits of a path the origin lists; an older one the blame names is dropped with its lines. */
const LOG_DEPTH = 20;
/** The engine's work ids (`createWork`): the date, a counter, a slug. A folder name outside it is not an item. */
export const WORK_ID = /^\d{4}-\d{2}-\d{2}-\d{3}-[a-z0-9][a-z0-9-]*$/;
const ITEM_FOLDER = /^\.crew\/work\/([^/]+)\//;

/** Every git call here reads paths as literal names: a pathspec magic (`:(glob)`, `:/`, `:!`) matches nothing. */
function git(root: string, ...args: string[]): string {
  return gitRun(root, "--literal-pathspecs", ...args);
}

/**
 * A path the origin may read (security review of SP3 Task 5): relative, no `..` segment, no NUL
 * or newline, and tracked as exactly that one file (a folder lists many, a magic pathspec none).
 * The one refusal says nothing about why, so the message gives away nothing about the tree.
 */
export function checkPath(root: string, path: string): string | null {
  const bad = `unknown path: ${path} (not in the repository)`;
  if (!path.trim() || isAbsolute(path) || /[\0\n\r]/.test(path)) return bad;
  if (path.split(/[\\/]/).includes("..")) return bad;
  let listed: string[];
  try {
    listed = git(root, "ls-files", "-z", "--error-unmatch", "--", path).split("\0").filter(Boolean);
  } catch {
    return bad;
  }
  return listed.length === 1 && listed[0] === path ? null : bad;
}

/** The newest twenty commits of a path, each with the lines `git blame` still attributes to it at HEAD. */
export function blameCommits(root: string, path: string): OriginCommit[] {
  const log = git(root, "log", "--format=%H%x09%aI%x09%an", "-n", String(LOG_DEPTH), "--", path);
  const commits: OriginCommit[] = log
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sha = "", at = "", author = ""] = line.split("\t");
      return { sha, at, author, lines: 0, items: [] };
    });
  const counts = new Map<string, number>();
  // One porcelain header per line of the file, the sha its first word.
  for (const line of git(root, "blame", "--porcelain", "--", path).split("\n")) {
    const header = /^([0-9a-f]{40}) \d+ \d+(?: \d+)?$/.exec(line);
    if (header?.[1]) counts.set(header[1], (counts.get(header[1]) ?? 0) + 1);
  }
  for (const c of commits) c.lines = counts.get(c.sha) ?? 0;
  return commits;
}

/** The work folders among the files a commit touched, as ids, unique and in order; a name outside the pattern is not one. */
export function itemsOfCommit(root: string, sha: string): string[] {
  const names = git(root, "show", "-z", "--name-only", "--format=", "--end-of-options", sha).split(
    "\0",
  );
  const ids: string[] = [];
  for (const name of names) {
    const id = ITEM_FOLDER.exec(name)?.[1];
    if (id && WORK_ID.test(id) && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** The item as the records at HEAD hold it; a folder that is gone, a symlink or unreadable gives the id alone. */
export function itemSummary(paths: CrewPaths, id: string): OriginItem {
  const empty: OriginItem = {
    id,
    title: null,
    kind: null,
    roles: [],
    tasks: [],
    decisions: 0,
    mail: 0,
  };
  const dir = workDir(paths, id);
  try {
    if (!lstatSync(dir).isDirectory()) return empty;
  } catch {
    return empty;
  }
  if (!existsSync(join(dir, "work.json"))) return empty;
  const { work } = loadWork(paths, id);
  if (!work) return empty;
  const { evidence } = loadEvidence(paths, id);
  const roles: string[] = [];
  for (const r of evidence.roles ?? []) if (!roles.includes(r.agent)) roles.push(r.agent);
  return {
    id,
    title: work.title,
    kind: kindOfItem(work),
    roles,
    tasks: (work.tasks ?? []).map((t) => t.task),
    decisions: listDecisions(paths).filter((e) => e.item === id).length,
    mail: loadItemMail(paths, id).box.messages.length,
  };
}

/**
 * The origin of the given paths from git and the records: every path checked before anything is
 * read (one refusal, nothing written), the items over all commits unique and in order of first
 * appearance; outside git an empty origin with the note.
 */
export function analyseOrigin(
  paths: CrewPaths,
  pathsToBlame: string[],
): Origin | { refused: string } {
  const at = nowIso();
  if (!isGitRepo(paths.root)) return { at, paths: [], items: [], note: "no git repository" };
  for (const p of pathsToBlame) {
    const bad = checkPath(paths.root, p);
    if (bad) return { refused: bad };
  }
  const items: OriginItem[] = [];
  const seen = new Map<string, string[]>();
  const result: OriginPath[] = pathsToBlame.map((path) => {
    const commits = blameCommits(paths.root, path);
    for (const c of commits) {
      let ids = seen.get(c.sha);
      if (!ids) {
        ids = itemsOfCommit(paths.root, c.sha);
        seen.set(c.sha, ids);
      }
      c.items = ids;
      for (const id of ids) if (!items.some((i) => i.id === id)) items.push(itemSummary(paths, id));
    }
    return { path, commits };
  });
  return { at, paths: result, items };
}

export function originPath(paths: CrewPaths, id: string): string {
  return join(workDir(paths, id), "analysis", "origin.json");
}

/** Engine-owned: written through the protected writer, denied to a hand by the hook. */
export function writeOrigin(paths: CrewPaths, id: string, origin: Origin): void {
  const file = originPath(paths, id);
  mkdirSync(dirname(file), { recursive: true });
  writeProtectedJson(paths, file, origin);
}

/** The origin as recorded, null without the file; a hand edit reads as tampered with no origin. */
export function readOrigin(
  paths: CrewPaths,
  id: string,
): { origin: Origin | null; tampered: boolean } | null {
  const file = originPath(paths, id);
  if (!existsSync(file)) return null;
  const read = readProtectedJson<Origin>(paths, file);
  if (read.tampered) return { origin: null, tampered: true };
  return { origin: read.data ?? null, tampered: false };
}

/** `roles a, b; tasks T-1`, or `none` for each, as the summary and the report say it (finding 88). */
export function rolesAndTasks(item: OriginItem): string {
  return `roles ${item.roles.join(", ") || "none"}; tasks ${item.tasks.join(", ") || "none"}`;
}

/** `3 commits, 1 item (<id>: roles a, b; tasks T-1)`: the unique shas across the paths, the items with their roles and tasks. */
export function originSummary(origin: Origin): string {
  const shas = new Set(origin.paths.flatMap((p) => p.commits.map((c) => c.sha)));
  const n = shas.size;
  const m = origin.items.length;
  const items = origin.items.map((i) => `${i.id}: ${rolesAndTasks(i)}`).join("; ");
  return `${n} commit${n === 1 ? "" : "s"}, ${m} item${m === 1 ? "" : "s"}${m ? ` (${items})` : ""}`;
}
