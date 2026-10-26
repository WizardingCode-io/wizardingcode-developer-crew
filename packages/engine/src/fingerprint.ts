import { execFileSync } from "node:child_process";
import { type Dirent, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { exists, sha256 } from "./fs.ts";
import { matchesAny } from "./glob.ts";
import { isDesignContractPath } from "./paths-kind.ts";
import { SKIP_DIRS } from "./skip-dirs.ts";
import type { Profile, WorkItem } from "./types.ts";

/** What a work item's change is measured from: a commit, and the proven files of an earlier item that were still uncommitted. */
export type ChangeBase = Pick<WorkItem, "baseCommit" | "baseFiles">;

/** Above this many files a folder without git is too big to hash on every hook. */
export const MAX_WATCHED_FILES = 20_000;
export const UNAVAILABLE = "unavailable";
/** A fingerprint made by hashing every watched file, as a folder without git gets. */
export const WALK_PREFIX = "walk:";
export type FingerprintMethod = "git" | "walk";

export function isGitRepo(root: string): boolean {
  return exists(join(root, ".git"));
}

function gitOut(root: string, args: string[]): string {
  // The live environment, so the git found is the one on the PATH of this moment (Bun resolves
  // the file from the env it is given, not from a snapshot).
  return execFileSync("git", args, {
    cwd: root,
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** Null when git itself could not run: not on PATH, a broken shim, a sandbox. Never "no output". */
function gitTry(root: string, args: string[]): string | null {
  try {
    return gitOut(root, args);
  } catch {
    return null;
  }
}

/** A file's content at a commit, or null when the commit or the path is not there. */
export function gitShowFile(root: string, commit: string, rel: string): string | null {
  return gitTry(root, ["show", `${commit}:${rel}`]);
}

export function gitHead(root: string): string {
  return gitTry(root, ["rev-parse", "HEAD"])?.trim() ?? "none";
}

/** The commit a work item's change is measured from: HEAD when it starts, or null without history. */
export function baseCommitOf(root: string): string | null {
  if (!isGitRepo(root)) return null;
  const head = gitHead(root);
  return head === "none" ? null : head;
}

/**
 * Paths that differ from HEAD: modified, added, deleted, renamed and untracked (not ignored).
 * Null when git could not run; a caller must not take that for "nothing changed".
 */
export function gitChangedPaths(root: string): string[] | null {
  const out = gitTry(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  if (out === null) return null;
  const entries = out.split("\0");
  const paths = new Set<string>();
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry || entry.length < 4) continue;
    paths.add(entry.slice(3));
    // A rename or copy entry is followed by the original path as its own record.
    if (entry[0] === "R" || entry[0] === "C") {
      const original = entries[++i];
      if (original) paths.add(original);
    }
  }
  return [...paths].sort();
}

/** Null when git could not run. */
export function untrackedPaths(root: string): string[] | null {
  const out = gitTry(root, ["ls-files", "--others", "--exclude-standard", "-z"]);
  return out === null ? null : out.split("\0").filter(Boolean);
}

/** Paths that differ from a base commit, committed since or not, plus untracked files. Null when git could not run. */
export function gitChangedSince(root: string, base: string): string[] | null {
  const diff = gitTry(root, ["diff", "--name-only", "--no-renames", "-z", base, "--"]);
  const untracked = untrackedPaths(root);
  if (diff === null || untracked === null) return null;
  return [...new Set([...diff.split("\0").filter(Boolean), ...untracked])].sort();
}

/** A new file as a patch, the way `git diff` shows an addition, so untracked files join the diff of the tracked ones. */
function additionPatch(root: string, path: string): string {
  let buffer: Buffer;
  try {
    buffer = readFileSync(join(root, path));
  } catch {
    return "";
  }
  const header = `diff --git a/${path} b/${path}\nnew file mode 100644\n--- /dev/null\n+++ b/${path}\n`;
  if (buffer.subarray(0, 8000).includes(0))
    return `${header}Binary files /dev/null and b/${path} differ\n`;
  const text = buffer.toString("utf8");
  if (text === "") return header;
  const lines = text.split("\n");
  const newlineAtEnd = lines.at(-1) === "";
  if (newlineAtEnd) lines.pop();
  const body = lines.map((line) => `+${line}`).join("\n");
  return `${header}@@ -0,0 +1,${lines.length} @@\n${body}\n${newlineAtEnd ? "" : "\\ No newline at end of file\n"}`;
}

/** The patch the reviewers receive, and what it lacks when something could not be cut (null when nothing). */
export interface ReviewPatch {
  patch: string;
  note: string | null;
}

/**
 * The unified diff of these paths since a base commit, the untracked ones as additions: what a
 * reviewer receives, the item's change and nothing else (SP2 §10). What cannot be cut is said in
 * the patch's first line and in the note, never left as an empty file beside a full files.txt
 * (review of SP2b, findings 9 and 10): outside git; no base commit (tracked files have no diff,
 * untracked ones are still additions); a diff git could not produce (a bad base, a buffer overrun).
 */
export function reviewPatch(
  root: string,
  base: string | null,
  paths: readonly string[],
): ReviewPatch {
  const said = (note: string, body = ""): ReviewPatch => ({ patch: `# ${note}\n${body}`, note });
  if (paths.length === 0) return said("no changed files");
  if (!isGitRepo(root)) return said("outside git, no diff can be cut");
  const untracked = new Set(untrackedPaths(root) ?? []);
  const tracked = paths.filter((p) => !untracked.has(p));
  const additions = paths
    .filter((p) => untracked.has(p))
    .map((p) => additionPatch(root, p))
    .join("");
  if (tracked.length === 0) return { patch: additions, note: null };
  const files = `${tracked.length} tracked file${tracked.length === 1 ? "" : "s"}`;
  if (base === null)
    return said(`no base commit: ${files} not shown, untracked ones as additions`, additions);
  // File names, never patterns: without it `a[1].ts` is a character class that pulls `a1.ts` into
  // the reviewers' diff (review of SP2b, finding 9).
  const diff = gitTry(root, [
    "--literal-pathspecs",
    "diff",
    "--no-renames",
    "--no-color",
    base,
    "--",
    ...tracked,
  ]);
  if (diff === null)
    return said(`git could not produce the diff of ${files} since ${base}`, additions);
  if (diff === "" && additions === "") return said("the change has no diff content");
  return { patch: diff + additions, note: null };
}

export function isWatched(path: string, profile: Profile): boolean {
  // A design contract is interface work (SP9 Task 6): watched even where the exclusions drop
  // Markdown or docs, so a change to it is a change the gates, the seats and the fingerprint read.
  if (isDesignContractPath(path)) return true;
  return !matchesAny(path, profile.watch.exclude);
}

/**
 * Every watched file outside git, or null above `maxFiles`. Symlinks are never followed, so a
 * link back up the tree cannot loop, and dependency and build folders are skipped.
 */
export function allWatchedFiles(
  root: string,
  profile: Profile,
  maxFiles = MAX_WATCHED_FILES,
): string[] | null {
  const files: string[] = [];
  let seen = 0;
  const walk = (dir: string, rel: string): boolean => {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return true;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink() || SKIP_DIRS.has(entry.name)) continue;
      const path = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!walk(join(dir, entry.name), path)) return false;
      } else if (entry.isFile()) {
        if (++seen > maxFiles) return false;
        if (isWatched(path, profile)) files.push(path);
      }
    }
    return true;
  };
  return walk(root, "") ? files.sort() : null;
}

function hashFile(abs: string): string {
  try {
    return sha256(readFileSync(abs));
  } catch {
    return "DELETED";
  }
}

/** The content hashes of these paths now; a missing file hashes as DELETED. */
export function hashPaths(root: string, paths: string[]): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const path of paths) hashes[path] = hashFile(join(root, path));
  return hashes;
}

/**
 * The item's own changes: the paths git lists, less those whose content is still what an earlier
 * item proved, plus any base file git no longer lists (reverted to the commit, or an untracked
 * file deleted) whose content left the proven state.
 */
function ownChanges(root: string, paths: string[], base?: ChangeBase | null): string[] {
  const files = base?.baseFiles;
  if (!files) return paths;
  const own = new Set(
    paths.filter((path) => files[path] === undefined || hashFile(join(root, path)) !== files[path]),
  );
  for (const [path, hash] of Object.entries(files)) {
    if (!paths.includes(path) && hashFile(join(root, path)) !== hash) own.add(path);
  }
  return [...own].sort();
}

/**
 * Watched paths the change touches. With a base commit, the change is everything since that
 * commit, so committing mid-work does not hide it, less what an earlier item proved and left
 * uncommitted. Without history, or where git cannot run, every watched file counts.
 */
export function changedWatchedPaths(
  root: string,
  profile: Profile,
  base?: ChangeBase | null,
  maxFiles = MAX_WATCHED_FILES,
): string[] {
  if (isGitRepo(root)) {
    const commit = base?.baseCommit ?? null;
    const paths = commit ? gitChangedSince(root, commit) : gitChangedPaths(root);
    if (paths !== null) {
      return ownChanges(
        root,
        paths.filter((path) => isWatched(path, profile)),
        base,
      );
    }
  }
  return allWatchedFiles(root, profile, maxFiles) ?? [];
}

/**
 * Every path the change touches, before the watch's exclusions (SP6 Task 6): a pack template's
 * globs name an agent's Markdown and `.claude/`, which the watch keeps out of the fingerprint and
 * the gates. Git's view since the item's base, the item's own changes; nothing outside git, where
 * the watched list walks the tree instead. Read for the templates' seats and for nothing else.
 */
export function changedPaths(root: string, base?: ChangeBase | null): string[] {
  if (!isGitRepo(root)) return [];
  const commit = base?.baseCommit ?? null;
  const paths = commit ? gitChangedSince(root, commit) : gitChangedPaths(root);
  return paths === null ? [] : ownChanges(root, paths, base);
}

/** The method a fingerprint was made with, so the same evidence is judged the same way everywhere. */
export function fingerprintMethod(fingerprint: string | null): FingerprintMethod | undefined {
  return fingerprint?.startsWith(WALK_PREFIX) ? "walk" : undefined;
}

/**
 * Names the state of the watched code. In git: the commit the change is measured from and the
 * content of each changed path (`sha256:`). Without git, or where git cannot run, or when asked
 * for the walk: the content of every watched file (`walk:`), or `unavailable` when there are too
 * many to hash. The walk gives the same name whether git works or not, so evidence written where
 * git was broken is still judged where it works.
 */
export function computeFingerprint(
  root: string,
  profile: Profile,
  base?: ChangeBase | null,
  maxFiles = MAX_WATCHED_FILES,
  method?: FingerprintMethod,
): string {
  if (method !== "walk" && isGitRepo(root)) {
    const commit = base?.baseCommit ?? null;
    const changed = commit ? gitChangedSince(root, commit) : gitChangedPaths(root);
    if (changed !== null) {
      const parts = [`base:${commit ?? gitHead(root)}`];
      const watched = changed.filter((p) => isWatched(p, profile));
      for (const path of ownChanges(root, watched, base)) {
        parts.push(`${path}:${hashFile(join(root, path))}`);
      }
      return `sha256:${sha256(parts.join("\n"))}`;
    }
  }
  const files = allWatchedFiles(root, profile, maxFiles);
  if (files === null) return UNAVAILABLE;
  const parts = files.map((path) => `${path}:${hashFile(join(root, path))}`);
  return `${WALK_PREFIX}${sha256(parts.join("\n"))}`;
}
