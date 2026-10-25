import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** The loop's home, a sibling of the engine's under the WizardingCode home (D-2, ADR 0001): `~/.wizardingcode/crew-improve`, or under `WIZARDINGCODE_HOME`. */
export function improveHome(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.WIZARDINGCODE_HOME ?? join(homedir(), ".wizardingcode"), "crew-improve");
}

/** A release the loop left pending after its push (AC-15), kept in `state.json`. */
export interface PendingRelease {
  version: string;
  failedStep: number;
}

/** The day's releases and failed steps, for the report (D-7). */
export interface DayState {
  date: string;
  releases: { version: string; run: string }[];
  failures: { run: string; step: number; name: string }[];
}

export interface ImproveState {
  lastTick?: string;
  lastRun?: { at: string; head: string; plan: string | null; lessons: number; run: string };
  pendingRelease?: PendingRelease | null;
  /** The install's probe: what the agent could reach (D-8). */
  probe?: Record<string, unknown>;
  day?: DayState;
  /** Failed ticks in a row, and until when the next one waits (the back-off after a failure). */
  failures?: number;
  backoffUntil?: string | null;
}

/** The loop's state as `<home>/state.json` holds it; nothing without one, and nothing for a file that is not JSON. */
export function readStateAt(home: string): ImproveState {
  const path = join(home, "state.json");
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as ImproveState;
  } catch {
    return {};
  }
}

/** The loop's state for this environment's home. */
export function improveState(env: NodeJS.ProcessEnv = process.env): ImproveState {
  return readStateAt(improveHome(env));
}
