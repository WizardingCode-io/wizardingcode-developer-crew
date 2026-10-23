import { rmSync } from "node:fs";
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

/** Where an item's engine run in progress leaves its marker. */
export function runningFile(paths: CrewPaths, id: string): string {
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
 * The run that lets this session's turn end once (finding 146): the item's marker names this
 * session, its pid is alive with the start time recorded, and no earlier Stop spent it. A malformed
 * marker or a dead pid's is removed; another session's and a reused pid's are left and permit nothing.
 */
export function runPermit(
  paths: CrewPaths,
  id: string,
  session: string,
  spent: readonly string[],
): RunningMarker | null {
  const file = runningFile(paths, id);
  const text = readText(file);
  if (text === null) return null;
  const marker = parseMarker(text);
  if (!marker || !isAlive(marker.pid)) {
    rmSync(file, { force: true });
    return null;
  }
  if (marker.session !== session || spent.includes(marker.startedAt)) return null;
  return processStart(marker.pid) === marker.processStart ? marker : null;
}
