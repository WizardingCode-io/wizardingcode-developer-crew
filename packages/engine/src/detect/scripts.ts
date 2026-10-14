import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { SKIP_DIRS } from "../skip-dirs.ts";

/**
 * The `test:*` convention many teams use (0.3.0, finding 23): `test:lint` is the check form of lint
 * (a `lint` script usually fixes, and a gate must not rewrite watched files), `test:types` the
 * typecheck, and the rest are tests. A variant that does not exit or needs a browser or a server
 * never enters a gate.
 */
const NEVER_A_GATE = /^test:(watch|ui|dev|debug|e2e|browser|visual)(?:[:-]|$)/;

export interface TestScripts {
  /** The check form of lint, when the project has one. */
  lint?: string;
  /** The type check, when the project names one as a test. */
  types?: string;
  /** The remaining `test:*` scripts, in the manifest's order. */
  rest: string[];
}

export function testScripts(scripts: Record<string, unknown>): TestScripts {
  const names = Object.keys(scripts).filter((n) => n.startsWith("test:"));
  const lint = names.find((n) => n === "test:lint");
  const types = names.find((n) => n === "test:types" || n === "test:typecheck");
  const rest = names.filter((n) => n !== lint && n !== types && !NEVER_A_GATE.test(n));
  return { ...(lint ? { lint } : {}), ...(types ? { types } : {}), rest };
}

const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

/** Whether the folder holds a test file bun would run, two levels deep at most, dependency folders aside. */
export function hasTestFiles(dir: string, depth = 0): boolean {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return false;
  }
  for (const name of names) {
    if (name.startsWith(".") || SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    let isDir = false;
    try {
      isDir = statSync(path).isDirectory();
    } catch {
      continue;
    }
    if (!isDir && TEST_FILE.test(name)) return true;
    if (isDir && depth < 2 && hasTestFiles(path, depth + 1)) return true;
  }
  return false;
}
