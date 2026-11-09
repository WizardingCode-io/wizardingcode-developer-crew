/**
 * The not-committed mark of a checkout (items 2026-11-09-001 and 2026-11-09-003, ADR 0023): what
 * wrote the runtime adapters and the commit the checkout stood at, kept in a file of its own beside
 * the adapters lock, so an engine of another version never drops it with a state it rewrites. A
 * refresh and a hand install write it, before each install and after it: a runtime whose install
 * began and did not return is held unfinished. A runtime is named under one root, the one that
 * installed it last. Every engine's SessionStart, `crew status` and the fleet read it to
 * remind the person to commit, or to run an install again; an entry goes once its adapter paths
 * are clean in git, or hold only changes a commit made after the write already touched. The file
 * holds no path and no command: both come from the reading engine's own runtime table.
 */

import { existsSync, lstatSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { gitStatusEntries } from "./fingerprint.ts";
import { readText, writeJson, writeText } from "./fs.ts";
import { lockHeld, withLock } from "./lock.ts";
import type { CrewPaths } from "./paths.ts";
import { quotedText } from "./quote.ts";
import { RUNTIME_NAMES, RUNTIMES, type RuntimeName } from "./runtimes.ts";
import { singleQuoted } from "./shell-words.ts";
import { compareVersions } from "./version.ts";
import { gitRun } from "./worktree.ts";

/** What one engine root wrote and left to commit. */
export interface UncommittedEntry {
  /** The engine version that wrote last. */
  version: string;
  at: string;
  /** The commit `HEAD` named when the write began. */
  head: string;
  /**
   * Each adapter the root wrote; `config` when the install wrote its configuration file;
   * `unfinished` when an install of it began and did not return, so its files may be part-written.
   */
  runtimes: { name: RuntimeName; config: boolean; unfinished?: true }[];
  /** Whether the refresh appended an entry to the register. */
  register: boolean;
}

/** One uncommitted entry as a reader says it. */
export interface ReminderEntry {
  root: string;
  version: string;
  /** Its finished runtimes: written and not committed. */
  updated: RuntimeName[];
  /** Its runtimes whose install began and did not return. */
  unfinished: RuntimeName[];
}

/** What a reader found: the uncommitted entries, the command that commits them all. */
export interface Reminder {
  entries: ReminderEntry[];
  /** Null while an entry holds an unfinished runtime, and with nothing to commit. */
  command: string | null;
  /** The first `git status` failure, through `quotedText`. */
  failed?: string;
  /** Whether the adapters lock was held at the read: an unfinished install may still be running. */
  held: boolean;
}

/** The project's decision register, from the project root. */
export const REGISTER = ".crew/decisions.json";
/** The crew of the tarball install, as every line that names a root to keep writes it. */
export const KEPT_ROOT_CREW = "~/.local/share/wizardingcode-developer-crew/bin/crew";
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

/**
 * An entry this engine can act on, or null: every field of the shape, every runtime in the table
 * and named once, since the names are printed and this rule, with the table, bounds how many.
 */
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
    const { name, config, unfinished } = item as Record<string, unknown>;
    if (typeof name !== "string" || name === "claude") return null;
    if (!(RUNTIME_NAMES as readonly string[]).includes(name)) return null;
    if (runtimes.some((r) => r.name === name)) return null;
    if (typeof config !== "boolean") return null;
    if (unfinished !== undefined && typeof unfinished !== "boolean") return null;
    runtimes.push({
      name: name as RuntimeName,
      config,
      ...(unfinished === true ? { unfinished: true as const } : {}),
    });
  }
  return { version: v.version, at: v.at, head: v.head, runtimes, register: v.register };
}

/**
 * The entries of the mark this engine recognises, by engine root; any other counts as absent. A
 * runtime is named under one root: walking the roots in the order of their names, an entry that
 * names a runtime an earlier one already names counts as absent too, so the table's five runtimes
 * bound the entries read, whatever the file holds.
 */
export function readMarks(paths: CrewPaths): Record<string, UncommittedEntry> {
  const marks: Record<string, UncommittedEntry> = {};
  const named = new Set<RuntimeName>();
  const raw = readRaw(paths);
  for (const root of Object.keys(raw).sort()) {
    const entry = root === "" ? null : recognised(raw[root]);
    if (!entry || entry.runtimes.some((r) => named.has(r.name))) continue;
    for (const r of entry.runtimes) named.add(r.name);
    marks[root] = entry;
  }
  return marks;
}

/** A raw file without a runtime: its item out of every recognised entry but `keep`'s, an entry left with no runtime removed. */
function withoutRuntimes(
  raw: Record<string, unknown>,
  names: ReadonlySet<string>,
  keep: string | null,
): boolean {
  let changed = false;
  for (const root of Object.keys(raw)) {
    if (root === keep || !recognised(raw[root])) continue;
    const value = raw[root] as Record<string, unknown>;
    const items = value.runtimes as { name: string }[];
    const kept = items.filter((item) => !names.has(item.name));
    if (kept.length === items.length) continue;
    changed = true;
    if (kept.length === 0) delete raw[root];
    else raw[root] = { ...value, runtimes: kept };
  }
  return changed;
}

/**
 * Merges what a root wrote into its entry and writes the mark: the runtimes united by name,
 * `config` and `register` true when either holds them, `unfinished` as the new item says, the
 * version, the time and the commit the new ones. Each runtime the new entry names leaves every
 * other root's entry, since the root that installed an adapter last owns its mark. Every other
 * key of the file is written back as read, so an entry another engine wrote survives. It takes no
 * lock: its callers hold the adapters lock, which is not reentrant. The write is a temporary file
 * renamed over the path, never through a link.
 */
export function noteUpdated(paths: CrewPaths, root: string, entry: UncommittedEntry): void {
  const raw = readRaw(paths);
  const earlier = recognised(raw[root]);
  const runtimes = (earlier?.runtimes ?? []).map((r) => ({ ...r }));
  for (const next of entry.runtimes) {
    const held = runtimes.find((r) => r.name === next.name);
    if (!held) {
      runtimes.push({ ...next });
      continue;
    }
    held.config = held.config || next.config;
    if (next.unfinished) held.unfinished = true;
    else delete held.unfinished;
  }
  withoutRuntimes(raw, new Set(entry.runtimes.map((r) => r.name)), root);
  raw[root] = {
    version: entry.version,
    at: entry.at,
    head: entry.head,
    runtimes,
    register: (earlier?.register ?? false) || entry.register,
  };
  writeJson(markPath(paths), raw);
}

/** The mark's bytes when its path is a regular file; null for nothing, a link or a folder there. */
export function markText(paths: CrewPaths): string | null {
  const path = markPath(paths);
  try {
    return lstatSync(path).isFile() ? readFileSync(path, "utf8") : null;
  } catch {
    return null;
  }
}

/**
 * Puts the mark back as `markText` read it: the bytes by a temporary file renamed over the path,
 * never through a link; with null, what is at the path removed, never recursively, so a link is
 * unlinked with its target untouched and a folder there throws.
 */
export function restoreMark(paths: CrewPaths, text: string | null): void {
  if (text === null) rmSync(markPath(paths), { force: true });
  else writeText(markPath(paths), text);
}

/** Takes a runtime out of every recognised entry: an entry left with no runtime goes, and the file left with no entry. */
export function dropRuntime(paths: CrewPaths, name: RuntimeName): void {
  const raw = readRaw(paths);
  if (!withoutRuntimes(raw, new Set([name]), null)) return;
  if (Object.keys(raw).length === 0) rmSync(markPath(paths), { force: true });
  else writeJson(markPath(paths), raw);
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
 * changes with every item, never makes it so, and is named in the command only beside one. An
 * unfinished runtime's configuration is watched whatever its `config` says, and while an entry
 * holds one no command is given: the skill folder is shared by every runtime, so a command for
 * the finished ones would commit a part-written copy. With `clear`, the clean entries of the file
 * are removed under the adapters lock, in one attempt, each only when it is still, key for key,
 * the entry that was judged: every write of an entry changes it. `also` stands for the root of a
 * write whose own note failed, and is read as that note would have been written. Never throws: a
 * mark that cannot be read counts as absent, a status that fails is said in `failed`, and a clear
 * that fails removes nothing.
 */
export function uncommittedAdapters(
  paths: CrewPaths,
  opts: { clear: boolean; also?: { root: string; entry: UncommittedEntry } | undefined },
): Reminder | null {
  const adaptersDir = join(paths.localDir, "adapters");
  const held = lockHeld(adaptersDir);
  let marks = readMarks(paths);
  if (opts.also) {
    // Read as a note of the entry would have written it: it replaces its root's entry, and its
    // runtimes leave the other roots' entries, an entry left with none going with them.
    const also = opts.also;
    const names = new Set(also.entry.runtimes.map((r) => r.name));
    const merged: Record<string, UncommittedEntry> = {};
    for (const [root, entry] of Object.entries(marks)) {
      if (root === also.root) continue;
      const runtimes = entry.runtimes.filter((r) => !names.has(r.name));
      if (runtimes.length) merged[root] = { ...entry, runtimes };
    }
    merged[also.root] = also.entry;
    marks = merged;
  }
  const roots = Object.keys(marks).sort();
  if (roots.length === 0) return null;
  const repo = existsSync(join(paths.root, ".git"));
  const reminder: Reminder = { entries: [], command: null, held };
  const named: string[] = [];
  const versions: string[] = [];
  const clean: string[] = [];
  for (const root of roots) {
    const entry = marks[root] as UncommittedEntry;
    const markClean = () => {
      if (opts.also?.root !== root) clean.push(root);
    };
    if (!repo) {
      markClean();
      continue;
    }
    const adapterSpecs = [
      ...new Set(
        entry.runtimes.flatMap((r) => runtimePathspecs(r.name, r.config || r.unfinished === true)),
      ),
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
      markClean();
      continue;
    }
    const since = committedSince(paths.root, entry.head, pathspec);
    const counting = changes.filter((path) => !since.has(path));
    const holds = (spec: string) => counting.some((path) => belongs(path, spec));
    if (!adapterSpecs.some(holds)) {
      markClean();
      continue;
    }
    reminder.entries.push({
      root,
      version: entry.version,
      updated: entry.runtimes.filter((r) => !r.unfinished).map((r) => r.name),
      unfinished: entry.runtimes.filter((r) => r.unfinished).map((r) => r.name),
    });
    versions.push(entry.version);
    for (const spec of specs) if (holds(spec) && !named.includes(spec)) named.push(spec);
  }
  if (versions.length && !reminder.entries.some((e) => e.unfinished.length)) {
    const newest = versions.reduce((a, b) => (compareVersions(a, b) >= 0 ? a : b));
    reminder.command = `git add -A -- ${named.map(singleQuoted).join(" ")} && git commit -m 'adapters refreshed by crew ${newest}'`;
  }
  if (opts.clear && clean.length) {
    try {
      withLock(
        adaptersDir,
        () => {
          const raw = readRaw(paths);
          let removed = false;
          for (const root of clean) {
            if (JSON.stringify(recognised(raw[root])) !== JSON.stringify(marks[root])) continue;
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
  return reminder.entries.length === 0 && reminder.failed === undefined ? null : reminder;
}

/** What a reader says of one runtime whose install began and did not return, by whether the lock is held and whose root it is. */
function unfinishedSentence(name: RuntimeName, version: string, held: boolean, own: boolean) {
  if (held)
    return `${name}'s install has not ended and the adapters lock is held: look again in ten seconds with crew status`;
  const how = own ? "again" : `again with the crew of its root, such as ${KEPT_ROOT_CREW}`;
  return `${name} left unfinished by crew ${version} (an install cut short or failed): run crew runtime install ${name} ${how}, then commit`;
}

/** One entry's unfinished runtimes as sentences; `own` is the reading engine's root. */
function unfinishedOf(entry: ReminderEntry, held: boolean, own: string): string[] {
  return entry.unfinished.map((name) =>
    unfinishedSentence(name, entry.version, held, entry.root === own),
  );
}

/** The sentences of a reminder's unfinished runtimes alone; `own` is the reading engine's root. */
export function unfinishedParts(reminder: Reminder | null, own: string): string[] {
  return reminder
    ? reminder.entries.flatMap((entry) => unfinishedOf(entry, reminder.held, own))
    : [];
}

/**
 * A reminder as sentences, per entry: its finished runtimes as updated and not committed, then one
 * sentence per unfinished runtime. `own` is the reading engine's root; `updatedNow` names the
 * runtimes a refresh of `own` updated in this same run: its result already says them, so they are
 * left out of `own`'s entry, and what is left of it reads `updated earlier`, since the entry's
 * version is the last write's.
 */
export function reminderParts(
  reminder: Reminder,
  opts: { own: string; updatedNow?: RuntimeName[] },
): string[] {
  const parts: string[] = [];
  for (const entry of reminder.entries) {
    const now = entry.root === opts.own ? (opts.updatedNow ?? []) : [];
    const names = entry.updated.filter((name) => !now.includes(name));
    if (names.length)
      parts.push(
        names.length < entry.updated.length
          ? `${names.join(", ")} updated earlier and not committed`
          : `${names.join(", ")} updated by crew ${entry.version} and not committed`,
      );
    parts.push(...unfinishedOf(entry, reminder.held, opts.own));
  }
  return parts;
}

/** The one line `crew status`, the hand install and the remove print of a reminder: the sentences, a failed check, the command. */
export function notCommittedLine(reminder: Reminder, own: string): string {
  const said = [
    ...reminderParts(reminder, { own }),
    ...(reminder.failed ? [`check failed (${reminder.failed})`] : []),
  ].join("; ");
  return `adapters not committed: ${said}${reminder.command ? `. Commit: ${reminder.command}` : ""}`;
}
