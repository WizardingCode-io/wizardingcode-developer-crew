import { join } from "node:path";
import { changedWatchedPaths } from "./fingerprint.ts";
import { nowIso } from "./fs.ts";
import { matchesAny } from "./glob.ts";
import { type CrewPaths, workDir } from "./paths.ts";
import { runCommand } from "./run.ts";
import type { CriterionKind, Evidence, Profile, RunRecord, WorkItem } from "./types.ts";

export type TddStep = "red" | "green" | "before" | "after" | "observed";

const STEPS_BY_KIND: Record<CriterionKind, { steps: TddStep[]; how: string }> = {
  behavior: { steps: ["red", "green"], how: "record red, then green" },
  preserve: { steps: ["before", "after"], how: "record before, then after" },
  observed: { steps: ["observed"], how: "record observed, with --reason" },
};

function article(kind: string): string {
  return /^[aeiou]/.test(kind) ? "an" : "a";
}

const TEST_PATTERNS = ["**/*test*", "**/*spec*", "tests/**", "test/**", "**/__tests__/**"];

export function defaultTestCommand(
  profile: Profile,
): { command: string; timeoutMs: number } | null {
  const target =
    profile.targets.find((t) => t.path === "." && t.gates.test) ??
    profile.targets.find((t) => t.gates.test);
  return target?.gates.test
    ? { command: target.gates.test.command, timeoutMs: target.timeoutMs }
    : null;
}

/** A run recorded carries `apply`, which writes the step's record into whatever evidence it is given (the caller applies it under the work folder's lock, finding 81); a refusal carries the run when one happened. */
export type TddOutcome =
  | { ok: true; message: string; record: RunRecord; apply: (evidence: Evidence) => void }
  | { ok: false; message: string; record?: RunRecord };

export async function recordTdd(
  paths: CrewPaths,
  work: WorkItem,
  evidence: Evidence,
  profile: Profile,
  criterionId: string,
  step: TddStep,
  override?: string,
  reason?: string,
): Promise<TddOutcome> {
  const criterion = work.criteria.find((c) => c.id === criterionId);
  if (!criterion) return { ok: false, message: `unknown criterion ${criterionId}` };
  const expected = STEPS_BY_KIND[criterion.kind];
  if (!expected.steps.includes(step)) {
    return {
      ok: false,
      message: `${criterionId} is ${article(criterion.kind)} ${criterion.kind} criterion: ${expected.how}`,
    };
  }
  if (step === "observed" && !reason?.trim()) {
    return { ok: false, message: "an observed run needs --reason: why no red run can exist" };
  }
  const fallback = defaultTestCommand(profile);
  const command = override ?? fallback?.command;
  if (!command) {
    return {
      ok: false,
      message: 'no test command: set one with crew profile set test "<cmd>" or pass -- <cmd>',
    };
  }
  const entry = evidence.tdd.find((t) => t.criterion === criterionId);
  if (step === "green" && !entry?.red)
    return { ok: false, message: `no red run recorded for ${criterionId}: run crew tdd red first` };
  if (step === "after" && !entry?.before)
    return {
      ok: false,
      message: `no before run recorded for ${criterionId}: run crew tdd before first`,
    };
  // A baseline is the tests green before the change (finding 79): with a watched source already
  // differing from the item's base, a before recorded now proves nothing the after does not, and
  // is refused. The tests may differ: the red test of a behaviour criterion comes first.
  if (step === "before") {
    const changed = changedWatchedPaths(paths.root, profile, work).filter(
      (p) => !matchesAny(p, TEST_PATTERNS),
    );
    if (changed.length) {
      const named = `${changed.slice(0, 3).join(", ")}${changed.length > 3 ? `, +${changed.length - 3} more` : ""}`;
      return {
        ok: false,
        message: `the watched sources already differ from the item's base (${named}): a before recorded now is not a baseline; record it before the change, or make ${criterionId} observed with the reason`,
      };
    }
  }
  // The record is written into whatever evidence the caller applies it to, never into this copy,
  // which was read before the run and may be stale by the time it ends (finding 81).
  const writeRecord = (recorded: TddStep, record: RunRecord) => (into: Evidence) => {
    let target = into.tdd.find((t) => t.criterion === criterionId);
    if (!target) {
      target = { criterion: criterionId };
      into.tdd.push(target);
    }
    target[recorded] = record;
    if (recorded === "observed" && reason) target.reason = reason.trim();
  };

  const log = `logs/tdd-${criterionId}-${step}-${Date.now()}.txt`;
  const result = await runCommand(command, {
    cwd: paths.root,
    timeoutMs: fallback?.timeoutMs ?? 10 * 60 * 1000,
    logPath: join(workDir(paths, work.id), log),
  });
  const record: RunRecord = {
    command,
    exit: result.exit,
    at: nowIso(),
    durationMs: result.durationMs,
    log,
    tail: result.tail,
    timedOut: result.timedOut,
  };
  const passed = result.exit === 0 && !result.timedOut;
  if (step === "red") {
    if (passed) {
      return {
        ok: false,
        message:
          "the test passed before the change; a test that passes before the code exists proves nothing",
        record,
      };
    }
    // A timeout, a command the shell could not find (127) or could not run (126) failed before any
    // test ran, so it says nothing about the missing behaviour.
    if (result.timedOut || result.exit === null || result.exit === 126 || result.exit === 127) {
      return {
        ok: false,
        message: `the red run did not fail for the right reason (exit ${result.exit ?? "none"}${result.timedOut ? ", timed out" : ""}): fix the command before recording`,
        record,
      };
    }
    record.changedTests = changedWatchedPaths(paths.root, profile, work).filter((p) =>
      matchesAny(p, TEST_PATTERNS),
    );
    return {
      ok: true,
      message: `red recorded for ${criterionId} (exit ${result.exit})`,
      record,
      apply: writeRecord("red", record),
    };
  }
  if (!passed) {
    return {
      ok: false,
      message: `${step} run failed (exit ${result.exit}${result.timedOut ? ", timed out" : ""}); nothing recorded`,
      record,
    };
  }
  return {
    ok: true,
    message: `${step} recorded for ${criterionId}`,
    record,
    apply: writeRecord(step, record),
  };
}
