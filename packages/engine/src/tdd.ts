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

export interface TddOutcome {
  ok: boolean;
  message: string;
  record?: RunRecord;
}

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
  let entry = evidence.tdd.find((t) => t.criterion === criterionId);
  if (!entry) {
    entry = { criterion: criterionId };
    evidence.tdd.push(entry);
  }
  if (step === "green" && !entry.red)
    return { ok: false, message: `no red run recorded for ${criterionId}: run crew tdd red first` };
  if (step === "after" && !entry.before)
    return {
      ok: false,
      message: `no before run recorded for ${criterionId}: run crew tdd before first`,
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
    entry.red = record;
    return { ok: true, message: `red recorded for ${criterionId} (exit ${result.exit})`, record };
  }
  if (!passed) {
    return {
      ok: false,
      message: `${step} run failed (exit ${result.exit}${result.timedOut ? ", timed out" : ""}); nothing recorded`,
      record,
    };
  }
  entry[step] = record;
  if (step === "observed" && reason) entry.reason = reason.trim();
  return { ok: true, message: `${step} recorded for ${criterionId}`, record };
}
