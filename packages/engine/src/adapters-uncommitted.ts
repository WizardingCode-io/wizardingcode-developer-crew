import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { gitStatusEntries } from "./fingerprint.ts";
import { readText, writeJson } from "./fs.ts";
import { withLock } from "./lock.ts";
import type { CrewPaths } from "./paths.ts";
import { quotedText } from "./quote.ts";
import { RUNTIME_NAMES, RUNTIMES, type RuntimeName } from "./runtimes.ts";
import { compareVersions } from "./version.ts";
import { gitRun } from "./worktree.ts";

/**
 * The not-committed mark of a checkout (item 2026-11-09-001, ADR 0023): what a refresh of the
 * runtime adapters updated and the commit the checkout stood at, kept in a file of its own beside
 * the adapters lock, so an engine of another version never drops it with a state it rewrites. A
 * refresh writes it; every engine's SessionStart, `crew status` and the fleet read it to remind
 * the person to commit; an entry goes once its adapter paths are clean in git, or hold only
 * changes a commit made after the refresh already touched. The file holds no path and no command:
 * both come from the reading engine's own runtime table.
 */

/** What one refresh updated for one engine root. */
export interface UncommittedEntry {
  /** The engine version that updated. */
  version: string;
  at: string;
  /** The commit `HEAD` named when the refresh began to install. */
  head: string;
  /** Each adapter that ended updated; `config` when the install wrote its configuration file. */
  runtimes: { name: RuntimeName; config: boolean }[];
  /** Whether the refresh appended an entry to the register. */
  register: boolean;
}

/** What a reader says: one sentence per uncommitted entry, the command that commits them all. */
export interface Reminder {
  parts: string[];
  /** `roots[i]` is the engine root whose entry gave `parts[i]`. */
  roots: string[];
  command: string | null;
  /** The first `git status` failure, through `quotedText`. */
  failed?: string;
}

/** The project's decision register, from the project root. */
export const REGISTER = ".crew/decisions.json";
const VERSION_SHAPE = /^\d+\.\d+\.\d+$/;
const HEAD_SHAPE = /^[0-9a-f]{40}([0-9a-f]{24})?$/;

export function markPath(paths: CrewPaths): string {
  return join(paths.localDir, "adapters", "uncommitted.json");
}

/**
 * A runtime's adapter paths as git pathspecs, from the project root: its configuration when asked,
 * the skill folder, its `crew-*` agents. The one builder of the set: the refresh's hold-back and
 * the mark's reader watch the same paths.
 */
export function runtimePathspecs(name: RuntimeName, config: boolean): string[] {
  const runtime = RUNTIMES[name];
  const specs: string[] = [];
  if (config) specs.push(runtime.config.project);
  specs.push(`${runtime.skillsDir.project}/crew-method`);
  if (runtime.agentsDir) specs.push(`${runtime.agentsDir.project}/crew-*`);
  return specs;
}

/** The file as it holds, every key: `{}` when it is absent, unreadable or no JSON object. */
function readRaw(paths: CrewPaths): Record<string, unknown> {
  try {
    const text = readText(markPath(paths));
    if (text === null) return {};
    const value: unknown = JSON.parse(text);
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** An entry this engine can act on, or null: every field of the shape, every runtime in the table. */
function recognised(value: unknown): UncommittedEntry | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.version !== "string" || !VERSION_SHAPE.test(v.version)) return null;
  if (typeof v.at !== "string") return null;
  if (typeof v.head !== "string" || !HEAD_SHAPE.test(v.head)) return null;
  if (typeof v.register !== "boolean") return null;
  if (!Array.isArray(v.runtimes) || v.runtimes.length === 0) return null;
  const runtimes: UncommittedEntry["runtimes"] = [];
  for (const item of v.runtimes) {
    if (item === null || typeof item !== "object") return null;
    const { name, config } = item as Record<string, unknown>;
    if (typeof name !== "string" || name === "claude") return null;
    if (!(RUNTIME_NAMES as readonly string[]).includes(name)) return null;
    if (typeof config !== "boolean") return null;
    runtimes.push({ name: name as RuntimeName, config });
  }
  return { version: v.version, at: v.at, head: v.head, runtimes, register: v.register };
}

/** The entries of the mark this engine recognises, by engine root; any other counts as absent. */
export function readMarks(paths: CrewPaths): Record<string, UncommittedEntry> {
  const marks: Record<string, UncommittedEntry> = {};
  for (const [root, value] of Object.entries(readRaw(paths))) {
    const entry = root === "" ? null : recognised(value);
    if (entry) marks[root] = entry;
  }
  return marks;
}

/**
 * Merges what a refresh updated into the root's entry and writes the mark: the runtimes united by
 * name, `config` and `register` true when either holds them, the version, the time and the commit
 * the new ones. Every other key of the file is written back as read, so an entry another engine
 * wrote survives. It takes no lock: its one caller holds the adapters lock, which is not
 * reentrant. The write is a temporary file renamed over the path, never through a link.
 */
export function noteUpdated(paths: CrewPaths, root: string, entry: UncommittedEntry): void {
  const raw = readRaw(paths);
  const earlier = recognised(raw[root]);
  const runtimes = (earlier?.runtimes ?? []).map((r) => ({ ...r }));
  for (const next of entry.runtimes) {
    const held = runtimes.find((r) => r.name === next.name);
    if (held) held.config = held.config || next.config;
    else runtimes.push({ ...next });
  }
  raw[root] = {
    version: entry.version,
    at: entry.at,
    head: entry.head,
    runtimes,
    register: (earlier?.register ?? false) || entry.register,
  };
  writeJson(markPath(paths), raw);
}

/** Whether a changed path, as git prints it from the project root, falls under a pathspec. */
function belongs(path: string, spec: string): boolean {
  if (spec.endsWith("crew-*")) return path.startsWith(spec.slice(0, -1));
  return path === spec || path.startsWith(`${spec}/`);
}

/**
 * The paths under the pathspecs that a commit touched after `head`, on top of it: a change to one
 * of them is no longer the refresh's. Empty when git cannot say (a commit this clone does not
 * hold, a rewritten history), so every change then counts.
 */
function committedSince(root: string, head: string, pathspec: string[]): Set<string> {
  try {
    const out = gitRun(
      root,
      "log",
      "--ancestry-path",
      "--no-renames",
      "-z",
      "--format=",
      "--name-only",
      `${head}..HEAD`,
      "--",
      ...pathspec,
    );
    return new Set(out.split(/[\0\n]/).filter((path) => path !== ""));
  } catch {
    return new Set();
  }
}

/**
 * What the mark says is still to commit, or null: per entry one `git status` under its paths and,
 * when it lists a change, one `git log` for what was committed since. An entry is uncommitted
 * when a change no later commit touched falls under one of its adapter paths; the register, which
 * changes with every item, never makes it so, and is named in the command only beside one. With
 * `clear`, the clean entries of the file are removed under the adapters lock, in one attempt.
 * `also` stands for the root of a refresh whose own write of the mark failed. Never throws: a mark
 * that cannot be read counts as absent, a status that fails is said in `failed`, and a clear that
 * fails removes nothing.
 */
export function uncommittedAdapters(
  paths: CrewPaths,
  opts: { clear: boolean; also?: { root: string; entry: UncommittedEntry } },
): Reminder | null {
  const marks = readMarks(paths);
  if (opts.also) marks[opts.also.root] = opts.also.entry;
  const roots = Object.keys(marks).sort();
  if (roots.length === 0) return null;
  const repo = existsSync(join(paths.root, ".git"));
  const reminder: Reminder = { parts: [], roots: [], command: null };
  const named: string[] = [];
  const versions: string[] = [];
  const clean: string[] = [];
  for (const root of roots) {
    const entry = marks[root] as UncommittedEntry;
    const isClean = () => {
      if (opts.also?.root !== root) clean.push(root);
    };
    if (!repo) {
      isClean();
      continue;
    }
    const adapterSpecs = [
      ...new Set(entry.runtimes.flatMap((r) => runtimePathspecs(r.name, r.config))),
    ];
    const specs = entry.register ? [...adapterSpecs, REGISTER] : adapterSpecs;
    const pathspec = specs.map((spec) => join(paths.root, spec));
    let changes: string[];
    try {
      changes = gitStatusEntries(paths.root, { pathspec }).map((e) => e.path);
    } catch (error) {
      reminder.failed ??= quotedText((error as Error).message, 200);
      continue;
    }
    if (changes.length === 0) {
      isClean();
      continue;
    }
    const since = committedSince(paths.root, entry.head, pathspec);
    const counting = changes.filter((path) => !since.has(path));
    const holds = (spec: string) => counting.some((path) => belongs(path, spec));
    if (!adapterSpecs.some(holds)) {
      isClean();
      continue;
    }
    const names = entry.runtimes.map((r) => r.name).join(", ");
    reminder.parts.push(`${names} updated by crew ${entry.version} and not committed`);
    reminder.roots.push(root);
    versions.push(entry.version);
    for (const spec of specs) if (holds(spec) && !named.includes(spec)) named.push(spec);
  }
  if (versions.length) {
    const newest = versions.reduce((a, b) => (compareVersions(a, b) >= 0 ? a : b));
    const quotedSpecs = named.map((spec) => `'${spec}'`).join(" ");
    reminder.command = `git add -A -- ${quotedSpecs} && git commit -m 'adapters refreshed by crew ${newest}'`;
  }
  if (opts.clear && clean.length) {
    try {
      withLock(
        join(paths.localDir, "adapters"),
        () => {
          const raw = readRaw(paths);
          let removed = false;
          for (const root of clean) {
            if (recognised(raw[root])?.at !== (marks[root] as UncommittedEntry).at) continue;
            delete raw[root];
            removed = true;
          }
          if (!removed) return;
          if (Object.keys(raw).length === 0) rmSync(markPath(paths), { force: true });
          else writeJson(markPath(paths), raw);
        },
        { what: "adapter refresh", waitMs: 0 },
      );
    } catch {
      // A busy lock, or any other failure: nothing is removed, and the next reader clears.
    }
  }
  return reminder.parts.length === 0 && reminder.failed === undefined ? null : reminder;
}
