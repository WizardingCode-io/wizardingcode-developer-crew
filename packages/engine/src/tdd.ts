import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { proposedByPack } from "./detect/index.ts";
import { changedWatchedPaths } from "./fingerprint.ts";
import { nowIso } from "./fs.ts";
import { matchesAny } from "./glob.ts";
import { type CrewPaths, workDir } from "./paths.ts";
import { joinWords, runCommand, shellRefusal } from "./run.ts";
import { testRunRefusal } from "./test-run.ts";
import type { CriterionKind, Evidence, Profile, RunRecord, WorkItem } from "./types.ts";

/**
 * The runners' own summary lines for a run that found nothing to run (finding 126), anchored per
 * runner and read as whole, unindented lines: bun, vitest, jest, pytest and PHPUnit. A line a
 * failing test printed is indented or a diff line, so its words never count (the security lead
 * of 2026-10-21-010).
 */
const NO_TEST_LINES: readonly RegExp[] = [
  /^error: .*matched 0 tests\. Searched /,
  /^Ran 0 tests across /,
  /^No test files found/,
  /^No tests found/,
  /^=+ no tests ran in /,
  /^No tests executed!?/,
];

/**
 * A shell's own line for a command it could not parse (finding 144): sh, bash, zsh and dash, whole
 * and unindented like the runners' lines, so a test's output quoting one is still a failing test.
 */
const PARSE_ERROR_LINE =
  /^(?:\/bin\/)?(?:sh|bash|zsh|dash): .*(?:syntax error|Syntax error|parse error)/;

/** The first line of a run's tail that one of `rules` matches, or null. */
function firstLine(tail: string, rules: readonly RegExp[]): string | null {
  for (const line of tail.split("\n")) {
    if (rules.some((rule) => rule.test(line))) return line;
  }
  return null;
}

/** The line of a run's tail that says no test ran, or null when the runner ran something. */
function ranNoTest(tail: string): string | null {
  return firstLine(tail, NO_TEST_LINES);
}

export type TddStep = "red" | "green" | "before" | "after" | "observed";

const STEPS_BY_KIND: Record<CriterionKind, { steps: TddStep[]; how: string }> = {
  behavior: { steps: ["red", "green"], how: "record red, then green" },
  preserve: { steps: ["before", "after"], how: "record before, then after" },
  observed: { steps: ["observed"], how: "record observed, with --reason" },
};

/** The shell's own line for a command it cannot parse, read with `sh -n` (nothing runs, so no log is kept, unlike `runCommand`'s), or null; never on Windows, whose shell has no such reading. */
function parseRefusal(command: string, cwd: string): string | null {
  if (process.platform === "win32") return null;
  const read = spawnSync("/bin/sh", ["-n", "-c", command], { cwd, encoding: "utf8" });
  if (read.status === 0 || read.error) return null;
  return firstLine(read.stderr, [PARSE_ERROR_LINE]) ?? read.stderr.trim().split("\n")[0] ?? "";
}

function article(kind: string): string {
  return /^[aeiou]/.test(kind) ? "an" : "a";
}

const TEST_PATTERNS = ["**/*test*", "**/*spec*", "tests/**", "test/**", "**/__tests__/**"];

/** The profile's test command a `crew tdd` step runs when none follows `--`, with the pack it came from while it is still proposed (SP6 Task 2 AC-3, round 3): such a command is never run unseen, here as at the gate run. */
export function defaultTestCommand(
  profile: Profile,
): { command: string; timeoutMs: number; heldBy: string | null } | null {
  const target =
    profile.targets.find((t) => t.path === "." && t.gates.test) ??
    profile.targets.find((t) => t.gates.test);
  const test = target?.gates.test;
  if (!target || !test) return null;
  return {
    command: test.command,
    timeoutMs: target.timeoutMs,
    heldBy: proposedByPack(test),
  };
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
  override?: string | readonly string[],
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
  // A superseded criterion is proven through its replacement (finding 118's list): its own
  // records stay as they are, and a new one would prove a text that is no longer the spec's.
  if (criterion.supersededBy)
    return {
      ok: false,
      message: `${criterionId} is superseded by ${criterion.supersededBy.id}: record the proof on ${criterion.supersededBy.id}`,
    };
  if (step === "observed" && !reason?.trim()) {
    return { ok: false, message: "an observed run needs --reason: why no red run can exist" };
  }
  // The words after `--` keep their boundaries (finding 91); shell words that would run in pieces
  // are refused before anything starts, and nothing is recorded.
  if (typeof override !== "string" && override) {
    const why = shellRefusal(override);
    if (why) return { ok: false, message: why };
  }
  const fallback = defaultTestCommand(profile);
  if (override === undefined && fallback?.heldBy)
    return {
      ok: false,
      message: `pack ${fallback.heldBy}'s command is not confirmed (crew profile confirm test): pass -- <cmd> to run another`,
    };
  const command =
    typeof override === "string" ? override : override ? joinWords(override) : fallback?.command;
  if (!command) {
    return {
      ok: false,
      message: 'no test command: set one with crew profile set test "<cmd>" or pass -- <cmd>',
    };
  }
  // A command after `--` is read before it runs (finding 153): one the shell cannot parse keeps
  // finding 144's refusal, read with `sh -n`, which runs nothing; one that is no test run is refused.
  if (override !== undefined && step !== "observed") {
    const unparsed = parseRefusal(command, paths.root);
    if (unparsed !== null)
      return {
        ok: false,
        message: `the shell could not parse the command (${unparsed}): fix the command (quote a pattern with parentheses) before recording`,
      };
    const why = testRunRefusal(command, paths.root, fallback?.command ?? null);
    if (why !== null)
      return {
        ok: false,
        message: `the command is no test run: ${why}; run the test (a runner in its test form, or an interpreter on a test file) before recording`,
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
    // A red over an earlier one keeps the earlier in the history (finding 29); the latest decides.
    if (recorded === "red" && target.red) target.reds = [...(target.reds ?? []), target.red];
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
  // A run the shell could not parse never started a test (finding 144): refused for every step. A
  // command after `--` was read with `sh -n` before it ran; this reads the profile's own command
  // and an observed run, which are not.
  const unparsed = firstLine(result.tail, [PARSE_ERROR_LINE]);
  if (unparsed !== null) {
    return {
      ok: false,
      message: `the shell could not parse the command (${unparsed}): fix the command (quote a pattern with parentheses) before recording`,
      record,
    };
  }
  // A runner that found nothing to run says so in its own words (finding 126): a red, a green, a
  // before, an after or an observed on such a run proves nothing, and nothing is recorded.
  const empty = ranNoTest(result.tail);
  if (empty !== null) {
    return {
      ok: false,
      message: `the run ran no test (${empty}): fix the command or the filter before recording`,
      record,
    };
  }
  if (step === "red") {
    if (passed) {
      return {
        ok: false,
        // The two ways out, named where the agent reads the refusal (finding 148).
        message: `the test passed before the change; a test that passes before the code exists proves nothing: write a test that fails first, or, for what an end-to-end run or a person checks, prove it with crew tdd observed ${work.id} ${criterionId} -- <command> (a criterion of kind observed)`,
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
