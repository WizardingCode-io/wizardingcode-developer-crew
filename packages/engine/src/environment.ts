import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { nowIso, readJson, writeJson } from "./fs.ts";
import { isAlive, killGroup, processStart } from "./open.ts";
import type { CrewPaths } from "./paths.ts";
import { runCommand } from "./run.ts";
import type { Environment } from "./types.ts";

/**
 * What the engine started, or found running, under the local state (SP7 §8.2): the pid and the
 * start time of the process it spawned, so a stop signals that process and never another that took
 * its pid; `managed: false` when health passed before the start, which the engine never stops.
 */
export interface EnvRecord {
  pid: number | null;
  processStart: string | null;
  startedAt: string;
  managed: boolean;
  log: string | null;
  command: string;
}

const HEALTH_TIMEOUT_MS = 30_000;
const STOP_TIMEOUT_MS = 60_000;
const POLL_MS = 2_000;

export function envRecordPath(paths: CrewPaths): string {
  return join(paths.localDir, "env.json");
}

function envLog(paths: CrewPaths, name: string): string {
  return join(paths.localDir, "env", name);
}

function stamp(): string {
  return nowIso().replace(/[:.]/g, "-");
}

/** The record as written by the engine; anything else reads as none. */
export function readEnvRecord(paths: CrewPaths): EnvRecord | null {
  const raw = readJson<Partial<EnvRecord>>(envRecordPath(paths));
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.managed !== "boolean" || typeof raw.startedAt !== "string") return null;
  return {
    pid: typeof raw.pid === "number" ? raw.pid : null,
    processStart: typeof raw.processStart === "string" ? raw.processStart : null,
    startedAt: raw.startedAt,
    managed: raw.managed,
    log: typeof raw.log === "string" ? raw.log : null,
    command: typeof raw.command === "string" ? raw.command : "",
  };
}

function removeRecord(paths: CrewPaths): void {
  try {
    unlinkSync(envRecordPath(paths));
  } catch {
    // no record
  }
}

/** One run of the health command from the project's root: exit 0 is up. */
export async function checkHealth(
  paths: CrewPaths,
  environment: Environment,
): Promise<{ up: boolean; exit: number | null; tail: string }> {
  const result = await runCommand(environment.health.command, {
    cwd: paths.root,
    timeoutMs: HEALTH_TIMEOUT_MS,
    logPath: envLog(paths, "health.txt"),
  });
  return { up: result.exit === 0 && !result.timedOut, exit: result.exit, tail: result.tail };
}

/** True while the recorded pid is alive and is still the process the engine started: a recorded start time, non-empty, equal to what `ps` prints for the pid now. */
function stillOurs(record: { pid: number | null; processStart: string | null }): boolean {
  if (record.pid === null || !isAlive(record.pid)) return false;
  return !!record.processStart && processStart(record.pid) === record.processStart;
}

export type StartOutcome =
  | { started: boolean; managed: boolean; pid: number | null; log: string | null }
  | { refused: string };

/**
 * Starts the environment unless it is already up (SP7 §8.2). Health first: up means the user's
 * environment, recorded as not managed and never stopped. Otherwise the start command runs
 * through the shell from the root, detached in its own process group, logged under the local
 * state, its pid and start time recorded before health is polled; health is polled every two
 * seconds until it passes or the timeout has elapsed, and on time out the group is ended (while it
 * is still the process started) and the record removed.
 */
export async function startEnvironment(
  paths: CrewPaths,
  environment: Environment,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<StartOutcome> {
  const before = await checkHealth(paths, environment);
  if (before.up) {
    writeJson(envRecordPath(paths), {
      pid: null,
      processStart: null,
      startedAt: nowIso(),
      managed: false,
      log: null,
      command: environment.health.command,
    } satisfies EnvRecord);
    return { started: false, managed: false, pid: null, log: null };
  }
  const log = envLog(paths, `start-${stamp()}.txt`);
  mkdirSync(dirname(log), { recursive: true });
  const fd = openSync(log, "a");
  let pid: number | undefined;
  try {
    const child = spawn(environment.start.command, {
      cwd: paths.root,
      shell: true,
      detached: true,
      stdio: ["ignore", fd, fd],
    });
    child.on("error", () => {});
    child.unref();
    pid = child.pid;
  } finally {
    closeSync(fd);
  }
  if (pid === undefined)
    return { refused: `the environment did not start (${environment.start.command})` };
  const record: EnvRecord = {
    pid,
    processStart: processStart(pid),
    startedAt: nowIso(),
    managed: true,
    log,
    command: environment.start.command,
  };
  writeJson(envRecordPath(paths), record);
  const until = Date.now() + environment.timeoutMs;
  for (;;) {
    if ((await checkHealth(paths, environment)).up)
      return { started: true, managed: true, pid, log };
    const left = until - Date.now();
    if (left <= 0) break;
    await sleep(Math.min(POLL_MS, left));
  }
  if (stillOurs(record)) killGroup(pid);
  removeRecord(paths);
  return {
    refused: `the environment did not answer health in ${Math.round(environment.timeoutMs / 1000)} s (${environment.health.command})`,
  };
}

/**
 * Stops what the engine started (SP7 §8.2): the stop command whenever the profile has one (a
 * compose environment outlives the command that started it, finding 71), then the process group,
 * signalled only while the recorded pid is alive and is still the process the engine started.
 * Refused with no record; refused for an environment that was up before the start, which is the
 * user's; and refused, with the record removed and nothing signalled, when the recorded process is
 * gone or its pid is another process's by now and the profile has no stop command to run.
 */
export async function stopEnvironment(
  paths: CrewPaths,
  environment: Environment,
): Promise<{ stopped: true; pid: number | null; signalled: boolean } | { refused: string }> {
  const record = readEnvRecord(paths);
  if (!record) return { refused: "nothing was started by the engine (crew env start)" };
  if (!record.managed)
    return {
      refused:
        "the environment was up before crew env start: it is the user's, and the engine never stops it",
    };
  const ours = stillOurs(record);
  if (!ours && !environment.stop) {
    removeRecord(paths);
    return {
      refused: `the recorded process (pid ${record.pid}) is gone; the record was removed and nothing was signalled`,
    };
  }
  if (environment.stop) {
    await runCommand(environment.stop.command, {
      cwd: paths.root,
      timeoutMs: STOP_TIMEOUT_MS,
      logPath: envLog(paths, `stop-${stamp()}.txt`),
    });
  }
  const signalled = ours && stillOurs(record);
  if (signalled) killGroup(record.pid as number);
  removeRecord(paths);
  return { stopped: true, pid: record.pid, signalled };
}

export interface EnvStatus {
  state: "up" | "down";
  managed: boolean | null;
  pid: number | null;
  since: string | null;
}

/** Up or down from one health run, and who started it from the record. */
export async function envStatus(paths: CrewPaths, environment: Environment): Promise<EnvStatus> {
  const health = await checkHealth(paths, environment);
  const record = readEnvRecord(paths);
  return {
    state: health.up ? "up" : "down",
    managed: record ? record.managed : null,
    pid: record?.pid ?? null,
    since: record?.startedAt ?? null,
  };
}
