import { homedir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { exists, sha256 } from "./fs.ts";

export interface CrewPaths {
  root: string;
  crewDir: string;
  localDir: string;
  userDir: string;
  integrityFile: string;
  repoId: string;
}

/** The nearest ancestor (or the folder itself) that holds `.crew` or `.git`. */
export function findRoot(cwd: string): string {
  let dir = resolve(cwd);
  for (;;) {
    if (exists(join(dir, ".crew")) || exists(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(cwd);
    dir = parent;
  }
}

export function resolvePaths(cwd: string, env: NodeJS.ProcessEnv = process.env): CrewPaths {
  const root = findRoot(cwd);
  const home = env.SHIBAOX_HOME ?? join(homedir(), ".shibaox");
  const userDir = join(home, "crew");
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

const PROTECTED_TOP = new Set([".crew/profile.json", ".crew/policy.json", ".crew/.gitignore"]);
const PROTECTED_IN_WORK = new Set(["work.json", "evidence.json", "report.md"]);

/** Files only the engine writes. The agent is denied direct writes to them. */
export function isProtectedPath(paths: CrewPaths, absPath: string): boolean {
  const abs = resolve(absPath);
  if (abs === paths.userDir || abs.startsWith(paths.userDir + sep)) return true;
  const rel = relative(paths.root, abs).replace(/\\/g, "/");
  if (rel.startsWith("..") || rel === "") return false;
  if (PROTECTED_TOP.has(rel)) return true;
  if (rel === ".crew/local" || rel.startsWith(".crew/local/")) return true;
  const inWork = /^\.crew\/work\/[^/]+\/(.+)$/.exec(rel);
  if (!inWork) return false;
  const inner = inWork[1] ?? "";
  return PROTECTED_IN_WORK.has(inner) || inner.startsWith("logs/");
}
