import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { exists, sha256 } from "./fs.ts";
import { matchesAny } from "./glob.ts";
import type { Profile } from "./types.ts";

const SKIP_DIRS = new Set([
  ".git",
  ".crew",
  "node_modules",
  "vendor",
  ".venv",
  "venv",
  "__pycache__",
]);

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

export function isWatched(path: string, profile: Profile): boolean {
  return !matchesAny(path, profile.watch.exclude);
}

export function allWatchedFiles(root: string, profile: Profile): string[] {
  const files: string[] = [];
  const walk = (dir: string, rel: string): void => {
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      if (SKIP_DIRS.has(name)) continue;
      const abs = join(dir, name);
      const path = rel ? `${rel}/${name}` : name;
      let isDir = false;
      try {
        isDir = statSync(abs).isDirectory();
      } catch {
        continue;
      }
      if (isDir) walk(abs, path);
      else if (isWatched(path, profile)) files.push(path);
    }
  };
  walk(root, "");
  return files.sort();
}

/** Without history there is nothing to diff against, so every watched file counts as changed. */
export function changedWatchedPaths(root: string, profile: Profile): string[] {
  if (!isGitRepo(root)) return allWatchedFiles(root, profile);
  return gitChangedPaths(root).filter((path) => isWatched(path, profile));
}

function hashFile(abs: string): string {
  try {
    return sha256(readFileSync(abs));
  } catch {
    return "DELETED";
  }
}

export function computeFingerprint(root: string, profile: Profile): string {
  const parts: string[] = [];
  if (isGitRepo(root)) {
    parts.push(`head:${gitHead(root)}`);
    for (const path of changedWatchedPaths(root, profile)) {
      parts.push(`${path}:${hashFile(join(root, path))}`);
    }
  } else {
    for (const path of allWatchedFiles(root, profile)) {
      parts.push(`${path}:${hashFile(join(root, path))}`);
    }
  }
  return `sha256:${sha256(parts.join("\n"))}`;
}
