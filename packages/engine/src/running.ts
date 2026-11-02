import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { nowIso, readText, writeText } from "./fs.ts";
import { isAlive, processStart } from "./open.ts";
import { type CrewPaths, workDir } from "./paths.ts";

/**
 * An engine run in progress (finding 146): a gate run or a tdd step, by the process that runs it and
 * the session that started it. The engine alone writes it, so the PreToolUse guard keeps it ours.
 */
export interface RunningMarker {
  command: string;
  pid: number;
  /** `ps`'s start time of the pid: a pid taken later by another process differs. */
  processStart: string;
  session: string;
  startedAt: string;
  /** A release marker's two more fields (2026-11-01-003): the version released and the commit HEAD was at. */
  version?: string;
  head?: string;
}

/** A release marker (2026-11-01-003): a running marker with the version released and the commit HEAD was at. */
export type ReleaseMarker = RunningMarker & { version: string; head: string };

/** The folder of a session's release markers, beside the items' running folders (2026-11-01-003): the guard denies a session's own writes there. */
function releaseDir(paths: CrewPaths): string {
  return join(paths.localDir, "running");
}

/** A process's release marker, in the release folder. */
function releaseFile(paths: CrewPaths, pid: number): string {
  return join(releaseDir(paths), `${pid}.json`);
}

/** Writes a release marker as its process's file, the folder made first. */
export function writeReleaseMarker(paths: CrewPaths, marker: ReleaseMarker): void {
  mkdirSync(releaseDir(paths), { recursive: true });
  writeText(releaseFile(paths, marker.pid), `${JSON.stringify(marker)}\n`);
}

/** Removes a process's release marker, present or not. */
export function removeReleaseMarker(paths: CrewPaths, pid: number): void {
  rmSync(releaseFile(paths, pid), { force: true });
}

/** How long a release marker holds: this repository's release takes 12 to 20 minutes, and a marker past this is removed when read. */
const RELEASE_MARKER_MAX_AGE_MS = 45 * 60 * 1000;

/** Where an item's engine runs in progress leave their markers: one file per run, by pid (finding 146). */
export function runningDir(paths: CrewPaths, id: string): string {
  return join(workDir(paths, id), "running");
}

/** The marker of one run of an item, this process's unless a pid is named. */
export function runningFile(paths: CrewPaths, id: string, pid: number = process.pid): string {
  return join(runningDir(paths, id), `${pid}.json`);
}

/** The single marker an engine before 0.14.0 wrote: read by no one now, cleared by the next run. */
function legacyFile(paths: CrewPaths, id: string): string {
  return join(workDir(paths, id), "running.json");
}

/**
 * Runs `run` with the marker on disk for its length, removed when it ends or throws. A run with no
 * session (a person's terminal) writes none: no Stop hook would read it.
 */
export async function withRunning<T>(
  paths: CrewPaths,
  id: string,
  session: string | null,
  command: string,
  run: () => Promise<T>,
): Promise<T> {
  if (!session) return run();
  // The single marker of an engine before 0.14.0 is read by no one now: a new run clears it.
  rmSync(legacyFile(paths, id), { force: true });
  const file = runningFile(paths, id);
  const marker: RunningMarker = {
    command,
    pid: process.pid,
    processStart: processStart(process.pid),
    session,
    startedAt: nowIso(),
  };
  writeText(file, `${JSON.stringify(marker)}\n`);
  try {
    return await run();
  } finally {
    rmSync(file, { force: true });
  }
}

/** The marker's fields when every one has its type, or null. */
function parseMarker(text: string): RunningMarker | null {
  try {
    const m = JSON.parse(text) as Partial<RunningMarker>;
    const strings = [m.command, m.processStart, m.session, m.startedAt];
    if (strings.every((s) => typeof s === "string") && Number.isInteger(m.pid))
      return m as RunningMarker;
  } catch {
    // not a marker
  }
  return null;
}

/**
 * The marker of a folder that lets this session's turn end: one that names this session, whose
 * file name is its pid, whose pid is alive with the start time recorded, and that no earlier Stop
 * spent. Two runs of one item keep two markers, each read alone. In this order per file: a
 * malformed (the shape, a time that does not parse, a release marker without its version or head)
 * or misnamed marker is removed; one past `maxAgeMs`, whatever its session, is removed; a dead
 * pid's is removed; another session's, a reused pid's and a spent one are left and permit nothing;
 * an old single running.json is never read (a new run clears it).
 */
function permitIn(
  dir: string,
  session: string,
  spent: readonly string[],
  options: { maxAgeMs?: number; release?: boolean } = {},
): RunningMarker | null {
  let names: string[];
  try {
    names = readdirSync(dir)
      .filter((n) => n.endsWith(".json"))
      .sort();
  } catch {
    return null;
  }
  for (const name of names) {
    const file = join(dir, name);
    const text = readText(file);
    const marker = text === null ? null : parseMarker(text);
    const shaped =
      marker !== null &&
      !Number.isNaN(Date.parse(marker.startedAt)) &&
      (!options.release || (typeof marker.version === "string" && typeof marker.head === "string"));
    const aged =
      marker !== null &&
      options.maxAgeMs !== undefined &&
      Date.now() - Date.parse(marker.startedAt) > options.maxAgeMs;
    if (!marker || !shaped || name !== `${marker.pid}.json` || aged || !isAlive(marker.pid)) {
      rmSync(file, { force: true });
      continue;
    }
    if (marker.session !== session || spent.includes(marker.startedAt)) continue;
    if (processStart(marker.pid) === marker.processStart) return marker;
  }
  return null;
}

/**
 * The run that lets this session's turn end once (finding 146): a marker of the item's running/
 * folder, as `permitIn` reads it, with no age.
 */
export function runPermit(
  paths: CrewPaths,
  id: string,
  session: string,
  spent: readonly string[],
): RunningMarker | null {
  return permitIn(runningDir(paths, id), session, spent);
}

/**
 * The release that lets this session's every turn end while it runs (2026-11-01-003): a marker of
 * the release folder, as `permitIn` reads it, with its version and head, under the age bound and
 * with nothing spent, since the release's end record ends it.
 */
export function releasePermit(paths: CrewPaths, session: string): ReleaseMarker | null {
  // The release shape is checked by the read: a marker without its version or head is removed.
  return permitIn(releaseDir(paths), session, [], {
    maxAgeMs: RELEASE_MARKER_MAX_AGE_MS,
    release: true,
  }) as ReleaseMarker | null;
}
