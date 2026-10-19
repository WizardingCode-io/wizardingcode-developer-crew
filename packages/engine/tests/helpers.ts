import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { buildContext } from "../src/hooks/context.ts";
import type { HookContext, HookPayload } from "../src/hooks/types.ts";
import { type CrewPaths, resolvePaths } from "../src/paths.ts";

const GIT_ENV = {
  GIT_AUTHOR_NAME: "Crew Test",
  GIT_AUTHOR_EMAIL: "crew@test.invalid",
  GIT_COMMITTER_NAME: "Crew Test",
  GIT_COMMITTER_EMAIL: "crew@test.invalid",
};

/**
 * The fixtures this run made, one set for every module instance that loads this file (the preload
 * and the test files), so the preload removes them all when the run ends (finding 74).
 */
const REGISTRY = "__wizardingcodeCrewTempDirs";
const globals = globalThis as Record<string, unknown>;
if (!(globals[REGISTRY] instanceof Set)) globals[REGISTRY] = new Set<string>();
export const TEMP_DIRS = globals[REGISTRY] as Set<string>;

/** Canonical (symlinks resolved), as the engine names every root: on macOS the temp dir is an alias. Registered for the cleanup at the end of the run. */
export function tempDir(prefix = "crew-"): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  TEMP_DIRS.add(dir);
  return dir;
}

/**
 * Removes the registered fixtures and returns how many (finding 74). None with
 * `WIZARDINGCODE_CREW_KEEP_FIXTURES=1`, the escape hatch for a failing test's post-mortem. A
 * registered path outside the canonical temp folder is skipped and stays registered: nothing but
 * the registry names a path to remove, and the registry never reaches outside the temp folder.
 */
export function removeTempDirs(): number {
  if (process.env.WIZARDINGCODE_CREW_KEEP_FIXTURES === "1") return 0;
  const temp = realpathSync(tmpdir());
  let removed = 0;
  for (const dir of [...TEMP_DIRS]) {
    if (!dir.startsWith(`${temp}${sep}`)) continue;
    rmSync(dir, { recursive: true, force: true });
    TEMP_DIRS.delete(dir);
    removed++;
  }
  return removed;
}

export function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...GIT_ENV },
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export function write(root: string, rel: string, text: string): void {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

/** A committed git repository in a temporary folder. */
export function makeRepo(files: Record<string, string> = { "README.md": "# test\n" }): string {
  const root = tempDir();
  git(root, "init", "-q", "-b", "main");
  for (const [rel, text] of Object.entries(files)) write(root, rel, text);
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "init");
  return root;
}

/** An environment whose user state lives in a fresh temporary home. */
export function testEnv(): NodeJS.ProcessEnv {
  const home = tempDir("crew-home-");
  // No test ever starts the real claude binary (finding 89): a session the engine opens for mail
  // runs this fake, which exits at once; a test that needs a session's shape sets its own fake.
  const fake = join(home, "claude");
  writeFileSync(fake, "#!/bin/sh\nexit 0\n");
  chmodSync(fake, 0o755);
  return { ...process.env, WIZARDINGCODE_HOME: home, WIZARDINGCODE_CREW_CLAUDE: fake };
}

/** Paths of a folder the test knows to be active (a git repository or one holding .crew/). */
export function repoPaths(root: string, env: NodeJS.ProcessEnv = testEnv()): CrewPaths {
  const paths = resolvePaths(root, env);
  if (!paths) throw new Error(`crew is inactive in ${root}`);
  return paths;
}

/** The hook context of an active folder. */
export function hookContext(payload: HookPayload, env: NodeJS.ProcessEnv = testEnv()): HookContext {
  const ctx = buildContext(payload, env);
  if (!ctx) throw new Error(`crew is inactive in ${payload.cwd}`);
  return ctx;
}
