import { execFileSync } from "node:child_process";
import { basename, resolve } from "node:path";

/** Runs git in a folder and returns its output, trimmed; git's failure is thrown. Git speaks the C locale, so a reason the engine reads or shows is the one it knows. */
export function gitRun(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C" },
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
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

/**
 * Removes a worktree, never by force: one that holds uncommitted or untracked files is kept, and
 * the reason says so, since a forced removal would take work nothing can bring back.
 */
export function removeWorktree(root: string, path: string): { kept: string } | null {
  try {
    gitRun(root, "worktree", "remove", path);
    return null;
  } catch (error) {
    return { kept: gitError(error) };
  }
}
