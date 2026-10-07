import { execFileSync } from "node:child_process";
import { type Dirent, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { exists, sha256 } from "./fs.ts";
import { matchesAny } from "./glob.ts";
import { SKIP_DIRS } from "./skip-dirs.ts";
import type { Profile } from "./types.ts";

/** Above this many files a folder without git is too big to hash on every hook. */
export const MAX_WATCHED_FILES = 20_000;
export const UNAVAILABLE = "unavailable";

export function isGitRepo(root: string): boolean {
  return exists(join(root, ".git"));
}

function gitOut(root: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 64 * 1024 * 1024,
  });
}

export function gitHead(root: string): string {
  try {
    return gitOut(root, ["rev-parse", "HEAD"]).trim();
  } catch {
    return "none";
  }
}

/** The commit a work item's change is measured from: HEAD when it starts, or null without history. */
export function baseCommitOf(root: string): string | null {
  if (!isGitRepo(root)) return null;
  const head = gitHead(root);
  return head === "none" ? null : head;
}

/** Paths that differ from HEAD: modified, added, deleted, renamed and untracked (not ignored). */
export function gitChangedPaths(root: string): string[] {
  let out: string;
  try {
    out = gitOut(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  } catch {
    return [];
  }
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

export function untrackedPaths(root: string): string[] {
  try {
    return gitOut(root, ["ls-files", "--others", "--exclude-standard", "-z"])
      .split("\0")
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** Paths that differ from a base commit, committed since or not, plus untracked files. */
export function gitChangedSince(root: string, base: string): string[] {
  let diffed: string[];
  try {
    diffed = gitOut(root, ["diff", "--name-only", "--no-renames", "-z", base, "--"])
      .split("\0")
      .filter(Boolean);
  } catch {
    diffed = [];
  }
  return [...new Set([...diffed, ...untrackedPaths(root)])].sort();
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

/**
 * Watched paths the change touches. With a base commit, the change is everything since that
 * commit, so committing mid-work does not hide it. Without history every watched file counts.
 */
export function changedWatchedPaths(
  root: string,
  profile: Profile,
  base?: string | null,
  maxFiles = MAX_WATCHED_FILES,
): string[] {
  if (!isGitRepo(root)) return allWatchedFiles(root, profile, maxFiles) ?? [];
  const paths = base ? gitChangedSince(root, base) : gitChangedPaths(root);
  return paths.filter((path) => isWatched(path, profile));
}

function hashFile(abs: string): string {
  try {
    return sha256(readFileSync(abs));
  } catch {
    return "DELETED";
  }
}

/**
 * Names the state of the watched code. In git: the commit the change is measured from and the
 * content of each changed path. Without git: the content of every watched file, or `unavailable`
 * when there are too many to hash.
 */
export function computeFingerprint(
  root: string,
  profile: Profile,
  base?: string | null,
  maxFiles = MAX_WATCHED_FILES,
): string {
  const parts: string[] = [];
  if (isGitRepo(root)) {
    parts.push(`base:${base ?? gitHead(root)}`);
    for (const path of changedWatchedPaths(root, profile, base)) {
      parts.push(`${path}:${hashFile(join(root, path))}`);
    }
  } else {
    const files = allWatchedFiles(root, profile, maxFiles);
    if (files === null) return UNAVAILABLE;
    for (const path of files) parts.push(`${path}:${hashFile(join(root, path))}`);
  }
  return `sha256:${sha256(parts.join("\n"))}`;
}
