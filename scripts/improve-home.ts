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
  /** The ticks of the day that died before their run ended (2026-10-28-001 AC-9): the lock's pid and start when they passed their checks, the run folder left without a record. */
  deadTicks?: DeadTick[];
  /** The runs of the day the user stopped (2026-10-28-001 AC-7): the report's row says so. */
  stoppedRuns?: string[];
  /** The first tick of the day that ran nothing because the day's budget was spent (2026-10-27-006 AC-5): when, the priced cost it read and the reason as it was written, so a report rewritten later in the day says the same words. */
  budgetSkip?: { at: string; costUsd: number; reason: string };
}

/** A tick that died: what its lock said, once checked (an integer pid above 1, an ISO start; null otherwise), and the run folder it left without a record (2026-10-28-001 AC-9). */
export interface DeadTick {
  pid: number | null;
  startedAt: string | null;
  run: string | null;
}

export interface ImproveState {
  lastTick?: string;
  /** The last run the user stopped with `bun scripts/improve-loop.ts stop` (2026-10-28-001 AC-7). */
  stopped?: { at: string; run: string | null };
  /** The size of launchd's stderr log when the last tick ended: `status` reports what came after (finding 171). */
  stderrBytes?: number;
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
