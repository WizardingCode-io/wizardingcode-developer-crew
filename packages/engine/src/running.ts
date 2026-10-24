import { readdirSync, rmSync } from "node:fs";
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
}

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
 * The run that lets this session's turn end once (finding 146): a marker of the item's running/
 * folder that names this session, whose file name is its pid, whose pid is alive with the start time
 * recorded, and that no earlier Stop spent. Two runs of one item keep two markers, each read alone.
 * A malformed, misnamed or dead pid's marker is removed; another session's and a reused pid's are
 * left and permit nothing; an old single running.json is never read (a new run clears it).
 */
export function runPermit(
  paths: CrewPaths,
  id: string,
  session: string,
  spent: readonly string[],
): RunningMarker | null {
  let names: string[];
  try {
    names = readdirSync(runningDir(paths, id))
      .filter((n) => n.endsWith(".json"))
      .sort();
  } catch {
    return null;
  }
  for (const name of names) {
    const file = join(runningDir(paths, id), name);
    const text = readText(file);
    const marker = text === null ? null : parseMarker(text);
    if (!marker || name !== `${marker.pid}.json` || !isAlive(marker.pid)) {
      rmSync(file, { force: true });
      continue;
    }
    if (marker.session !== session || spent.includes(marker.startedAt)) continue;
    if (processStart(marker.pid) === marker.processStart) return marker;
  }
  return null;
}
