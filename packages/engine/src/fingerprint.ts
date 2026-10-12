import { execFileSync } from "node:child_process";
import { type Dirent, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { exists, sha256 } from "./fs.ts";
import { matchesAny } from "./glob.ts";
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

export function isWatched(path: string, profile: Profile): boolean {
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

/** Drops the paths whose content is still what an earlier item proved. */
function ownChanges(root: string, paths: string[], base?: ChangeBase | null): string[] {
  const files = base?.baseFiles;
  if (!files) return paths;
  return paths.filter(
    (path) => files[path] === undefined || hashFile(join(root, path)) !== files[path],
  );
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
