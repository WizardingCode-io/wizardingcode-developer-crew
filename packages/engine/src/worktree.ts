import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import { readText } from "./fs.ts";
import { canonical } from "./paths.ts";

/** The main checkout of a git worktree (its `.git` is a file naming the parent's), or null for a checkout of its own. */
export function worktreeMainRoot(root: string): string | null {
  const gitFile = join(root, ".git");
  try {
    if (!statSync(gitFile).isFile()) return null;
  } catch {
    return null;
  }
  const line = readText(gitFile)?.trim() ?? "";
  const match = /^gitdir:\s*(.+?)\/\.git\/worktrees\/[^/]+\/?$/.exec(line);
  return match?.[1] ? canonical(isAbsolute(match[1]) ? match[1] : join(root, match[1])) : null;
}

/** Runs git in a folder and returns its output, trimmed; git's failure is thrown. Git speaks the C locale, so a reason the engine reads or shows is the one it knows. */
export function gitRun(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C" },
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/**
 * Every worktree of the repository a folder is in, the main checkout included, each by its real
 * path, from `git worktree list --porcelain`; a git failure (none on PATH, no repository) is none.
 */
export function worktreeRoots(cwd: string): string[] {
  try {
    return gitRun(cwd, "worktree", "list", "--porcelain")
      .split("\n")
      .filter((line) => line.startsWith("worktree "))
      .map((line) => canonical(line.slice("worktree ".length)));
  } catch {
    return [];
  }
}

/** The bytes of a file at a branch's tip, or null when the branch or the file is not there; the revision goes after `--end-of-options`, so neither can be read as an option. */
export function gitShow(cwd: string, branch: string, path: string): Buffer | null {
  try {
    return execFileSync("git", ["show", "--end-of-options", `${branch}:${path}`], {
      cwd,
      env: { ...process.env, LC_ALL: "C" },
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    return null;
  }
}

/** The first line git wrote on its error output, the part a person reads; the exception's own line otherwise. */
export function gitError(error: unknown): string {
  const failed = error as { stderr?: string | Buffer; message: string };
  const stderr = failed.stderr?.toString().trim().split("\n")[0];
  return stderr || (failed.message.split("\n")[0] ?? "");
}

/**
 * The folder of a worktree (plan decision 12): beside the root by default (`worktrees` is `..`),
 * under the policy's `mail.worktrees` otherwise, named after the repository and the work it holds.
 */
export function worktreePath(root: string, worktrees: string, name: string): string {
  return resolve(root, worktrees, `${basename(root)}-${name}`);
}

/** A worktree of `root` on a new branch from HEAD, or why git refused. */
export function addWorktree(root: string, branch: string, path: string): { failed: string } | null {
  try {
    gitRun(root, "worktree", "add", "-q", "-b", branch, path, "HEAD");
    return null;
  } catch (error) {
    return { failed: `git worktree add failed in ${root}: ${gitError(error)}` };
  }
}

/** Deletes a branch the engine made and no longer needs (git makes it before the worktree's folder); a branch git cannot delete is left. */
export function dropBranch(root: string, branch: string): void {
  try {
    gitRun(root, "branch", "-D", branch);
  } catch {
    // never made, or still checked out somewhere
  }
}

/** The engine's own folder in a checkout: what it writes there (the profile, its ignore file, the records) is its own, never the implementer's work. */
const ENGINE_DIR = ".crew/";

/**
 * The paths `git status` lists as changed or untracked in a worktree (a rename names both sides).
 * The two status columns are read by a pattern, since `gitRun` trims the output and a leading
 * space in the first column would otherwise shift the first path.
 */
function dirtyPaths(path: string): string[] {
  return (
    gitRun(path, "status", "--porcelain", "--untracked-files=all")
      .split("\n")
      // `!!` (ignored) is not in the class: without `--ignored` the status never lists it.
      .map((line) => /^\s*[MADRCU?]{0,2}\s+(.+)$/.exec(line)?.[1] ?? "")
      .filter((p) => p.length > 0)
      .flatMap((p) => p.split(" -> "))
  );
}

/** Whether a worktree is dirty only under the engine's own folder; false when its status cannot be read. */
function onlyEngineDirt(path: string): boolean {
  try {
    const dirty = dirtyPaths(path);
    return dirty.length > 0 && dirty.every((p) => p.startsWith(ENGINE_DIR));
  } catch {
    return false;
  }
}

/**
 * Removes a worktree. One that holds uncommitted or untracked files of the implementer's is kept,
 * and the reason says so, since a forced removal would take work nothing can bring back; one dirty
 * only under the engine's own folder (the profile it refreshed after the last commit, its ignore
 * file, records the merge has already copied) goes anyway (finding #43).
 */
export function removeWorktree(root: string, path: string): { kept: string } | null {
  try {
    gitRun(root, "worktree", "remove", path);
    return null;
  } catch (error) {
    if (!onlyEngineDirt(path)) return { kept: gitError(error) };
    try {
      gitRun(root, "worktree", "remove", "--force", path);
      return null;
    } catch (forced) {
      return { kept: gitError(forced) };
    }
  }
}
