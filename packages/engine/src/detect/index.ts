import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { nowIso } from "../fs.ts";
import { matchesAny } from "../glob.ts";
import { SKIP_DIRS } from "../skip-dirs.ts";
import type { GateCommand, GateName, Profile, Target } from "../types.ts";
import { nodeDetector } from "./node.ts";
import { phpDetector } from "./php.ts";
import { pythonDetector } from "./python.ts";
import type { Detector } from "./types.ts";

export const DETECTORS: readonly Detector[] = [nodeDetector, phpDetector, pythonDetector];
export const DEFAULT_WATCH_EXCLUDE = ["**/*.md", "docs/**", ".crew/**", ".claude/**"];
export const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
/** Defaults of earlier releases. A saved list equal to one of them was never the user's choice, so it follows the current default. */
const FORMER_WATCH_EXCLUDES: readonly (readonly string[])[] = [["**/*.md", "docs/**", ".crew/**"]];
const MAX_DEPTH = 3;

/** True when the saved watch list is the default of an earlier release, so a refresh would move it. */
export function isFormerWatchDefault(profile: Profile): boolean {
  const saved = JSON.stringify(profile.watch.exclude);
  return FORMER_WATCH_EXCLUDES.some((list) => JSON.stringify(list) === saved);
}

function watchOf(previous: Profile | null): Profile["watch"] {
  if (!previous) return { exclude: [...DEFAULT_WATCH_EXCLUDE] };
  return isFormerWatchDefault(previous) ? { exclude: [...DEFAULT_WATCH_EXCLUDE] } : previous.watch;
}

function* folders(root: string, depth = 0): Generator<string> {
  yield root;
  if (depth >= MAX_DEPTH) return;
  let names: string[];
  try {
    names = readdirSync(root).sort();
  } catch {
    return;
  }
  for (const name of names) {
    if (name.startsWith(".") || SKIP_DIRS.has(name)) continue;
    const path = join(root, name);
    try {
      if (!statSync(path).isDirectory()) continue;
    } catch {
      continue;
    }
    yield* folders(path, depth + 1);
  }
}

export function detectTargets(root: string): Target[] {
  const targets: Target[] = [];
  const workspaces = new Map<Target, string[]>();
  for (const dir of folders(root)) {
    for (const detector of DETECTORS) {
      const found = detector.detect(dir);
      if (!found) continue;
      const gates: Target["gates"] = {};
      for (const [gate, command] of Object.entries(found.gates) as [GateName, string][]) {
        gates[gate] = { command, source: found.proposed ? "proposed" : "detected" };
      }
      const rel = relative(root, dir).replace(/\\/g, "/");
      const target: Target = {
        path: rel === "" ? "." : rel,
        stack: found.stack,
        packageManager: found.packageManager,
        gates,
        timeoutMs: DEFAULT_TIMEOUT_MS,
      };
      targets.push(target);
      if (found.workspaces) workspaces.set(target, found.workspaces);
    }
  }
  // A member runs under the package that lists it, so that package's gates cover what the member leaves undefined.
  for (const [parent, globs] of workspaces) {
    const prefix = parent.path === "." ? "" : `${parent.path}/`;
    for (const child of targets) {
      if (child === parent || child.stack !== parent.stack || !child.path.startsWith(prefix))
        continue;
      if (matchesAny(child.path.slice(prefix.length), globs)) child.workspaceOf = parent.path;
    }
  }
  return targets;
}

/** Fresh detection never discards what a person proposed or confirmed. */
export function mergeProfile(previous: Profile | null, detected: Target[]): Profile {
  const targets = detected.map((t) => ({ ...t, gates: { ...t.gates } }));
  if (previous) {
    for (const target of targets) {
      const old = previous.targets.find((t) => t.path === target.path && t.stack === target.stack);
      if (!old) continue;
      target.timeoutMs = old.timeoutMs;
      for (const [gate, command] of Object.entries(old.gates) as [GateName, GateCommand][]) {
        if (command.source !== "detected") target.gates[gate] = command;
      }
    }
  }
  return {
    version: 1,
    detectedAt: nowIso(),
    targets,
    watch: watchOf(previous),
  };
}

export function detectProfile(root: string, previous: Profile | null = null): Profile {
  return mergeProfile(previous, detectTargets(root));
}

export interface MissingCommand {
  target: string;
  gate: "test";
}

/**
 * Test is the one gate every path must have. A path counts as covered when any of its
 * targets has a test command, so a Laravel app with a Vite package.json is not nagged.
 */
export function missingTestCommands(profile: Profile): MissingCommand[] {
  if (profile.targets.length === 0) return [{ target: ".", gate: "test" }];
  const byPath = new Map(profile.targets.map((t) => [t.path, t]));
  const hasTest = (t: Target): boolean =>
    !!t.gates.test || (t.workspaceOf !== undefined && !!byPath.get(t.workspaceOf)?.gates.test);
  const covered = new Set(profile.targets.filter(hasTest).map((t) => t.path));
  const paths = [...new Set(profile.targets.map((t) => t.path))];
  return paths.filter((p) => !covered.has(p)).map((target) => ({ target, gate: "test" }));
}
