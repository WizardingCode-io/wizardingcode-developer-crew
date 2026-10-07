import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { nowIso } from "../fs.ts";
import type { GateCommand, GateName, Profile, Target } from "../types.ts";
import { nodeDetector } from "./node.ts";
import { phpDetector } from "./php.ts";
import { pythonDetector } from "./python.ts";
import type { Detector } from "./types.ts";

export const DETECTORS: readonly Detector[] = [nodeDetector, phpDetector, pythonDetector];
export const DEFAULT_WATCH_EXCLUDE = ["**/*.md", "docs/**", ".crew/**"];
export const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_DEPTH = 3;
const SKIP_DIRS = new Set([
  "node_modules",
  "vendor",
  "dist",
  "build",
  "coverage",
  "storage",
  "target",
  ".venv",
  "venv",
  "__pycache__",
]);

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
  for (const dir of folders(root)) {
    for (const detector of DETECTORS) {
      const found = detector.detect(dir);
      if (!found) continue;
      const gates: Target["gates"] = {};
      for (const [gate, command] of Object.entries(found.gates) as [GateName, string][]) {
        gates[gate] = { command, source: "detected" };
      }
      const rel = relative(root, dir).replace(/\\/g, "/");
      targets.push({
        path: rel === "" ? "." : rel,
        stack: found.stack,
        packageManager: found.packageManager,
        gates,
        timeoutMs: DEFAULT_TIMEOUT_MS,
      });
    }
  }
  return targets;
}

/** Fresh detection never discards what a person proposed or confirmed. */
export function mergeProfile(previous: Profile | null, targets: Target[]): Profile {
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
    watch: previous?.watch ?? { exclude: [...DEFAULT_WATCH_EXCLUDE] },
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
  const covered = new Set(profile.targets.filter((t) => t.gates.test).map((t) => t.path));
  const paths = [...new Set(profile.targets.map((t) => t.path))];
  return paths.filter((p) => !covered.has(p)).map((target) => ({ target, gate: "test" }));
}
