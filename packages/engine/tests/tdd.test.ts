import { expect, test } from "bun:test";
import { chmodSync, existsSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { tddDone } from "../src/criteria.ts";
import { detectProfile } from "../src/detect/index.ts";
import { emptyEvidence } from "../src/evidence.ts";
import { workDir } from "../src/paths.ts";
import { passCount, recordTdd as record } from "../src/tdd.ts";
import { testRunRefusal } from "../src/test-run.ts";
import type { RunRecord, Target } from "../src/types.ts";
import { addCriterion, createWork } from "../src/work.ts";
import { makeRepo, repoPaths, testEnv, write } from "./helpers.ts";

/** The engine's record, applied to the evidence it was given, as the CLI applies it under the lock (finding 81). */
async function recordTdd(...args: Parameters<typeof record>): ReturnType<typeof record> {
  const out = await record(...args);
  if (out.ok) out.apply(args[2]);
  return out;
}

function setup() {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "sh run-tests.sh" } }),
    "run-tests.sh": "exit 1\n",
  });
  const paths = repoPaths(root, testEnv());
  const profile = detectProfile(root);
  const work = createWork(paths, "fix");
  const behaviour = addCriterion(work, "x");
  const preserve = addCriterion(work, "keep", "preserve");
  return { root, paths, profile, work, behaviour, preserve, evidence: emptyEvidence() };
}

test("red must fail, green must pass after red, and test files are recorded", async () => {
  const s = setup();
  write(s.root, "tests/cart.test.js", "new test");
  const red = await recordTdd(s.paths, s.work, s.evidence, s.profile, s.behaviour.id, "red");
  expect(red.ok).toBe(true);
  expect(s.evidence.tdd[0]?.red?.exit).toBe(1);
  expect(s.evidence.tdd[0]?.red?.changedTests).toEqual(["tests/cart.test.js"]);
  const early = await recordTdd(s.paths, s.work, s.evidence, s.profile, s.behaviour.id, "green");
  expect(early.ok).toBe(false);
  expect(early.message).toMatch(/failed/);
  write(s.root, "run-tests.sh", "exit 0\n");
  const green = await recordTdd(s.paths, s.work, s.evidence, s.profile, s.behaviour.id, "green");
  expect(green.ok).toBe(true);
  expect(s.evidence.tdd[0]?.green?.exit).toBe(0);
});

test("I7: a red run that could not run (missing command, timeout) is not a red", async () => {
  const s = setup();
  write(s.root, "tests/missing.test.sh", "exit 127\n");
  write(s.root, "tests/denied.test.sh", "exit 126\n");
  write(s.root, "tests/slow.test.sh", "sleep 5\n");
  const missing = await recordTdd(
    s.paths,
    s.work,
    s.evidence,
    s.profile,
    s.behaviour.id,
    "red",
    "sh tests/missing.test.sh",
  );
  expect(missing.ok).toBe(false);
  expect(missing.message).toBe(
    "the red run did not fail for the right reason (exit 127): fix the command before recording",
  );
  const denied = await recordTdd(
    s.paths,
    s.work,
    s.evidence,
    s.profile,
    s.behaviour.id,
    "red",
    "sh tests/denied.test.sh",
  );
  expect(denied.ok).toBe(false);
  const target = s.profile.targets[0];
  if (!target) throw new Error("no target");
  target.timeoutMs = 300;
  const slow = await recordTdd(
    s.paths,
    s.work,
    s.evidence,
    s.profile,
    s.behaviour.id,
    "red",
    "sh tests/slow.test.sh",
  );
  expect(slow.ok).toBe(false);
  expect(slow.message).toStartWith("the red run did not fail for the right reason (exit ");
  expect(s.evidence.tdd[0]?.red).toBeUndefined();
});

test("a passing red run is rejected and green needs an earlier red", async () => {
  const s = setup();
  write(s.root, "run-tests.sh", "exit 0\n");
  const red = await recordTdd(s.paths, s.work, s.evidence, s.profile, s.behaviour.id, "red");
  expect(red.ok).toBe(false);
  expect(red.message).toMatch(/proves nothing/);
  const green = await recordTdd(s.paths, s.work, s.evidence, s.profile, s.behaviour.id, "green");
  expect(green.ok).toBe(false);
  expect(green.message).toMatch(/no red run/);
});

test("preserve criteria use before and after, and kinds are enforced", async () => {
  const s = setup();
  write(s.root, "run-tests.sh", "exit 0\n");
  expect(
    (await recordTdd(s.paths, s.work, s.evidence, s.profile, s.preserve.id, "red")).message,
  ).toMatch(/preserve/);
  expect(
    (await recordTdd(s.paths, s.work, s.evidence, s.profile, s.preserve.id, "after")).message,
  ).toMatch(/no before run/);
  expect(
    (await recordTdd(s.paths, s.work, s.evidence, s.profile, s.preserve.id, "before")).ok,
  ).toBe(true);
  expect((await recordTdd(s.paths, s.work, s.evidence, s.profile, s.preserve.id, "after")).ok).toBe(
    true,
  );
});

test("SP2a: observed records a passing run with a reason, and refuses the other steps for that kind", async () => {
  const s = setup();
  const observed = addCriterion(s.work, "the stubbed e2e passes", "observed");
  expect(
    (await recordTdd(s.paths, s.work, s.evidence, s.profile, observed.id, "red", "exit 1")).message,
  ).toBe(`${observed.id} is an observed criterion: record observed, with --reason`);
  expect(
    (await recordTdd(s.paths, s.work, s.evidence, s.profile, observed.id, "observed", "exit 0"))
      .message,
  ).toBe("an observed run needs --reason: why no red run can exist");
  const failing = await recordTdd(
    s.paths,
    s.work,
    s.evidence,
    s.profile,
    observed.id,
    "observed",
    "exit 1",
    "the dev server stubs the backend",
  );
  expect(failing.ok).toBe(false);
  const ok = await recordTdd(
    s.paths,
    s.work,
    s.evidence,
    s.profile,
    observed.id,
    "observed",
    "exit 0",
    "the dev server stubs the backend",
  );
  expect(ok.ok).toBe(true);
  const record = s.evidence.tdd.find((t) => t.criterion === observed.id);
  expect(record).toMatchObject({ reason: "the dev server stubs the backend" });
  expect(record?.observed?.exit).toBe(0);
  expect(tddDone(record, "observed")).toBe(true);
  expect(
    (
      await recordTdd(
        s.paths,
        s.work,
        s.evidence,
        s.profile,
        s.behaviour.id,
        "observed",
        "exit 0",
        "x",
      )
    ).message,
  ).toBe(`${s.behaviour.id} is a behavior criterion: record red, then green`);
});

test("an explicit command overrides the profile, and no command is an error", async () => {
  const s = setup();
  write(s.root, "tests/seven.test.sh", "exit 7\n");
  const red = await recordTdd(
    s.paths,
    s.work,
    s.evidence,
    s.profile,
    s.behaviour.id,
    "red",
    "sh tests/seven.test.sh",
  );
  expect(red.ok).toBe(true);
  expect(s.evidence.tdd[0]?.red?.command).toBe("sh tests/seven.test.sh");
  const bare = { ...s.profile, targets: [] };
  const none = await recordTdd(s.paths, s.work, emptyEvidence(), bare, s.behaviour.id, "red");
  expect(none.message).toMatch(/no test command/);
});

test("SP3-T1 AC-3 (finding 79): a before is refused, naming the paths, when a watched source already differs from the item's base; a changed test file alone is allowed", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "sh run-tests.sh" } }),
    "run-tests.sh": "exit 0\n",
    "src/x.mjs": "a\n",
    "src/y.mjs": "a\n",
  });
  const paths = repoPaths(root, testEnv());
  const profile = detectProfile(root);
  const work = createWork(paths, "refactor");
  const preserve = addCriterion(work, "keep", "preserve");
  const evidence = emptyEvidence();
  write(root, "src/x.mjs", "b\n");
  write(root, "src/y.mjs", "b\n");
  const late = await recordTdd(paths, work, evidence, profile, preserve.id, "before");
  expect(late.ok).toBe(false);
  expect(late.message).toBe(
    `the watched sources already differ from the item's base (src/x.mjs, src/y.mjs): a before recorded now is not a baseline; record it before the change, or make ${preserve.id} observed with the reason`,
  );
  expect(late.record).toBeUndefined();
  expect(evidence.tdd).toEqual([]);
  // Past three paths the message counts the rest.
  write(root, "src/a.mjs", "b\n");
  write(root, "src/b.mjs", "b\n");
  const many = await recordTdd(paths, work, evidence, profile, preserve.id, "before");
  expect(many.message).toContain("(src/a.mjs, src/b.mjs, src/x.mjs, +1 more)");
  rmSync(join(root, "src", "a.mjs"));
  rmSync(join(root, "src", "b.mjs"));
  write(root, "src/x.mjs", "a\n");
  write(root, "src/y.mjs", "a\n");
  write(root, "tests/x.test.mjs", "the red test of a behaviour criterion\n");
  const early = await recordTdd(paths, work, evidence, profile, preserve.id, "before");
  expect(early.ok).toBe(true);
  if (early.ok) early.apply(evidence);
  expect(evidence.tdd[0]?.before?.exit).toBe(0);
});

test("SP8-T1 AC-1 (finding 91): a record given shell words with more than one after -c is refused before any run, nothing recorded; the words of a quoted string reach the shell whole", async () => {
  const s = setup();
  write(s.root, "tests/cart.test.js", "new test");
  const refused = await recordTdd(s.paths, s.work, s.evidence, s.profile, s.behaviour.id, "red", [
    "sh",
    "-c",
    "bun",
    "run",
    "check",
  ]);
  expect(refused.ok).toBe(false);
  expect(refused.message).toContain("quote the command string as one argument");
  expect(refused.record).toBeUndefined();
  expect(s.evidence.tdd).toEqual([]);
  // `sh -c "sh tests/red.test.sh"` as words: joined without its quotes the shell would run `sh`
  // with $0=tests/red.test.sh, read nothing and pass.
  write(s.root, "tests/red.test.sh", "exit 1\n");
  const red = await recordTdd(s.paths, s.work, s.evidence, s.profile, s.behaviour.id, "red", [
    "sh",
    "-c",
    "sh tests/red.test.sh",
  ]);
  expect(red.ok, red.message).toBe(true);
  expect(s.evidence.tdd.find((t) => t.criterion === s.behaviour.id)?.red?.exit).toBe(1);
});

test("SP6-T2 AC-3 (round 3): crew tdd without -- never runs a pack's proposed test command; the words after --, a confirmed one and a core guess run", async () => {
  const s = setup();
  const target = s.profile.targets[0] as Target;
  target.gates.test = {
    command: "touch ran.txt && exit 1",
    source: "proposed",
    pack: "wizardingcode-pack-x",
  };
  const held = await recordTdd(s.paths, s.work, s.evidence, s.profile, s.behaviour.id, "red");
  expect(held.ok).toBe(false);
  expect(held.message).toBe(
    "pack wizardingcode-pack-x's command is not confirmed (crew profile confirm test): pass -- <cmd> to run another",
  );
  expect(existsSync(join(s.root, "ran.txt"))).toBe(false);
  expect(s.evidence.tdd).toEqual([]);
  // The words after -- run, the pack's command untouched.
  write(s.root, "tests/own.test.sh", "exit 1\n");
  const own = await recordTdd(s.paths, s.work, s.evidence, s.profile, s.behaviour.id, "red", [
    "sh",
    "tests/own.test.sh",
  ]);
  expect(own.ok).toBe(true);
  expect(existsSync(join(s.root, "ran.txt"))).toBe(false);
  // Confirmed by a person: it is the fallback again.
  target.gates.test.source = "confirmed";
  const second = addCriterion(s.work, "y");
  expect((await recordTdd(s.paths, s.work, s.evidence, s.profile, second.id, "red")).ok).toBe(true);
  expect(existsSync(join(s.root, "ran.txt"))).toBe(true);
  // A core detector's own guess (no pack) runs unconfirmed, as it did.
  target.gates.test = { command: "touch guess.txt && exit 1", source: "proposed" };
  const third = addCriterion(s.work, "z");
  expect((await recordTdd(s.paths, s.work, s.evidence, s.profile, third.id, "red")).ok).toBe(true);
  expect(existsSync(join(s.root, "guess.txt"))).toBe(true);
});

test("AC-4 (finding 126): a run whose output says no test ran is refused for every step, naming the line, and records nothing", async () => {
  const s = setup();
  const bunLine =
    'error: regex "AC-4 (finding 119)" matched 0 tests. Searched 1 file (skipping 146 tests) [36.00ms]';
  write(s.root, "run-tests.sh", `echo '${bunLine}'\nexit 1\n`);
  const red = await recordTdd(s.paths, s.work, s.evidence, s.profile, s.behaviour.id, "red");
  expect(red.ok).toBe(false);
  expect(red.message).toBe(
    `the run ran no test (${bunLine}): fix the command or the filter before recording`,
  );
  expect(s.evidence.tdd).toEqual([]);
  expect(red.record?.log).toMatch(/^logs\/tdd-AC-1-red-/);
  // A passing run that ran nothing is no before either.
  write(s.root, "run-tests.sh", "echo 'Ran 0 tests across 0 files. [5.00ms]'\nexit 0\n");
  const before = await recordTdd(s.paths, s.work, s.evidence, s.profile, s.preserve.id, "before");
  expect(before.ok).toBe(false);
  expect(before.message).toBe(
    "the run ran no test (Ran 0 tests across 0 files. [5.00ms]): fix the command or the filter before recording",
  );
  // The other runners' own lines.
  for (const line of [
    "No test files found, exiting with code 1",
    "No tests found, exiting with code 1",
    "============================ no tests ran in 0.01s =============================",
    "No tests executed!",
  ]) {
    write(s.root, "run-tests.sh", `echo '${line}'\nexit 1\n`);
    const refused = await recordTdd(s.paths, s.work, s.evidence, s.profile, s.behaviour.id, "red");
    expect(refused.ok, line).toBe(false);
    expect(refused.message, line).toBe(
      `the run ran no test (${line}): fix the command or the filter before recording`,
    );
  }
  expect(s.evidence.tdd).toEqual([]);
  // A run that ran tests is recorded as today.
  write(s.root, "run-tests.sh", "echo ' 0 pass'\necho ' 1 fail'\nexit 1\n");
  const real = await recordTdd(s.paths, s.work, s.evidence, s.profile, s.behaviour.id, "red");
  expect(real.ok).toBe(true);
  expect(s.evidence.tdd[0]?.red?.exit).toBe(1);
  // Every step: a green, an after and an observed on an empty run are refused the same way.
  const empty = "echo 'Ran 0 tests across 0 files. [5.00ms]'\nexit 0\n";
  write(s.root, "run-tests.sh", empty);
  const green = await recordTdd(s.paths, s.work, s.evidence, s.profile, s.behaviour.id, "green");
  expect(green.ok).toBe(false);
  expect(green.message).toContain("the run ran no test (Ran 0 tests across 0 files.");
  expect(s.evidence.tdd[0]?.green).toBeUndefined();
  write(s.root, "run-tests.sh", "echo ' 1 pass'\nexit 0\n");
  expect(
    (await recordTdd(s.paths, s.work, s.evidence, s.profile, s.preserve.id, "before")).ok,
  ).toBe(true);
  write(s.root, "run-tests.sh", empty);
  const after = await recordTdd(s.paths, s.work, s.evidence, s.profile, s.preserve.id, "after");
  expect(after.ok).toBe(false);
  expect(after.message).toContain("the run ran no test (");
  const observed = addCriterion(s.work, "seen", "observed");
  const seen = await recordTdd(
    s.paths,
    s.work,
    s.evidence,
    s.profile,
    observed.id,
    "observed",
    undefined,
    "no red run can exist",
  );
  expect(seen.ok).toBe(false);
  expect(seen.message).toContain("the run ran no test (");
  expect(s.evidence.tdd.find((t) => t.criterion === observed.id)).toBeUndefined();
});

test("AC-7 (finding 126): the markers are the runner's own line: a phrase inside an indented assertion message or a diff line is a failing test, recorded as a red", async () => {
  const indented = setup();
  write(
    indented.root,
    "run-tests.sh",
    "echo '(fail) x'\necho '    error: expect(received).toContain(expected)'\necho '    Expected: matched 0 tests'\necho ' 0 pass'\necho ' 1 fail'\nexit 1\n",
  );
  const a = await recordTdd(
    indented.paths,
    indented.work,
    indented.evidence,
    indented.profile,
    indented.behaviour.id,
    "red",
  );
  expect(a.ok, a.message).toBe(true);
  const diff = setup();
  write(
    diff.root,
    "run-tests.sh",
    "echo '(fail) y'\necho '+ No tests found'\necho '- x'\necho ' 1 fail'\nexit 1\n",
  );
  const b = await recordTdd(
    diff.paths,
    diff.work,
    diff.evidence,
    diff.profile,
    diff.behaviour.id,
    "red",
  );
  expect(b.ok, b.message).toBe(true);
  const own = setup();
  write(
    own.root,
    "run-tests.sh",
    "echo 'error: regex \"x\" matched 0 tests. Searched 1 file (skipping 3 tests) [1.00ms]'\nexit 1\n",
  );
  const c = await recordTdd(
    own.paths,
    own.work,
    own.evidence,
    own.profile,
    own.behaviour.id,
    "red",
  );
  expect(c.ok).toBe(false);
  expect(c.message).toContain("the run ran no test (error: regex");
});

test("AC-4 (item C2a): one negative row per anchored zero-test rule: the runner's phrase indented or prefixed is a failing test's own output, recorded as a red", async () => {
  const scripts = [
    "echo '    error: regex \"x\" matched 0 tests. Searched 1 file'\necho ' 1 fail'\nexit 1\n",
    "echo '  Ran 0 tests across 0 files.'\necho ' 1 fail'\nexit 1\n",
    "echo '> No test files found, exiting with code 1'\necho ' 1 fail'\nexit 1\n",
    "echo '- ===== no tests ran in 0.01s ====='\necho ' 1 fail'\nexit 1\n",
    "echo '    No tests executed!'\necho ' 1 fail'\nexit 1\n",
  ];
  for (const script of scripts) {
    const s = setup();
    write(s.root, "run-tests.sh", script);
    const red = await recordTdd(s.paths, s.work, s.evidence, s.profile, s.behaviour.id, "red");
    expect(red.ok, script).toBe(true);
  }
});

test("CON6-AC-11 (finding 29): a second crew tdd red of a criterion keeps the earlier red in the record's history, the latest deciding", async () => {
  const s = setup();
  const first = await recordTdd(s.paths, s.work, s.evidence, s.profile, s.behaviour.id, "red");
  expect(first.ok).toBe(true);
  const earlier = s.evidence.tdd[0]?.red;
  write(s.root, "run-tests.sh", "exit 2\n");
  const second = await recordTdd(s.paths, s.work, s.evidence, s.profile, s.behaviour.id, "red");
  expect(second.ok).toBe(true);
  const row = s.evidence.tdd[0] as unknown as { red?: RunRecord; reds?: RunRecord[] };
  expect(row.red?.exit).toBe(2);
  expect(row.reds).toEqual([earlier as RunRecord]);
  // A third red appends the second, in order.
  const latest = row.red;
  write(s.root, "run-tests.sh", "exit 3\n");
  await recordTdd(s.paths, s.work, s.evidence, s.profile, s.behaviour.id, "red");
  expect(row.red?.exit).toBe(3);
  expect(row.reds).toEqual([earlier as RunRecord, latest as RunRecord]);
});

test("AC-11 (finding 144): a run the shell could not parse is refused for every step, naming the line, and records nothing; a runner's own failure is still a red", async () => {
  const s = setup();
  // The real thing: an unquoted pattern with parentheses, as the red of 2026-10-23-004 was given.
  const red = await recordTdd(
    s.paths,
    s.work,
    s.evidence,
    s.profile,
    s.behaviour.id,
    "red",
    "echo DEBT-AC-2-(rsync-late|tar-bundled)",
  );
  expect(red.ok).toBe(false);
  expect(red.message).toMatch(
    /^the shell could not parse the command \(.*(syntax error|Syntax error|parse error).*\): fix the command \(quote a pattern with parentheses\) before recording$/,
  );
  expect(s.evidence.tdd).toEqual([]);
  // Each shell's own line, whole and unindented, refuses every step.
  const lines = [
    "sh: -c: line 0: syntax error near unexpected token `('",
    "/bin/sh: -c: line 1: syntax error: unexpected end of file",
    "bash: -c: line 0: syntax error near unexpected token `|'",
    "zsh: parse error near `('",
    'sh: 1: Syntax error: "(" unexpected',
    'dash: 1: Syntax error: "(" unexpected',
  ];
  for (const line of lines) {
    write(s.root, "run-tests.sh", `echo "${line.replace(/[`"]/g, "\\$&")}"\nexit 2\n`);
    const refused = await recordTdd(s.paths, s.work, s.evidence, s.profile, s.behaviour.id, "red");
    expect(refused.ok, line).toBe(false);
    expect(refused.message, line).toBe(
      `the shell could not parse the command (${line}): fix the command (quote a pattern with parentheses) before recording`,
    );
  }
  expect(s.evidence.tdd).toEqual([]);
  // The other steps, on a passing run that printed a shell's parse error.
  const parse = 'echo "zsh: parse error near \\`(\'"\nexit 0\n';
  write(s.root, "run-tests.sh", parse);
  const before = await recordTdd(s.paths, s.work, s.evidence, s.profile, s.preserve.id, "before");
  expect(before.ok).toBe(false);
  expect(before.message).toContain("the shell could not parse the command (zsh: parse error");
  const observed = addCriterion(s.work, "seen", "observed");
  const seen = await recordTdd(
    s.paths,
    s.work,
    s.evidence,
    s.profile,
    observed.id,
    "observed",
    undefined,
    "no red run can exist",
  );
  expect(seen.ok).toBe(false);
  expect(seen.message).toContain("the shell could not parse the command (");
  expect(s.evidence.tdd).toEqual([]);
  // A runner's own failure is a red: exit 1, a runner's exit 2, a JavaScript SyntaxError line, an
  // indented shell line inside a failing test's output.
  for (const [body, exit] of [
    ["echo ' 0 pass'\necho ' 1 fail'", 1],
    ["echo 'FAILED tests/test_x.py::test_y'\necho '1 failed in 0.02s'", 2],
    ["echo 'SyntaxError: Unexpected token (3:4)'\necho ' 1 fail'", 1],
    ["echo '    sh: -c: line 0: syntax error near unexpected token'\necho ' 1 fail'", 1],
  ] as const) {
    const genuine = setup();
    write(genuine.root, "run-tests.sh", `${body}\nexit ${exit}\n`);
    const ok = await recordTdd(
      genuine.paths,
      genuine.work,
      genuine.evidence,
      genuine.profile,
      genuine.behaviour.id,
      "red",
    );
    expect(ok.ok, body).toBe(true);
    expect(genuine.evidence.tdd[0]?.red?.exit).toBe(exit);
  }
  // Green and after on a parse error are refused as well.
  write(s.root, "run-tests.sh", "echo ' 1 fail'\nexit 1\n");
  expect((await recordTdd(s.paths, s.work, s.evidence, s.profile, s.behaviour.id, "red")).ok).toBe(
    true,
  );
  write(s.root, "run-tests.sh", parse);
  const green = await recordTdd(s.paths, s.work, s.evidence, s.profile, s.behaviour.id, "green");
  expect(green.ok).toBe(false);
  expect(green.message).toContain("the shell could not parse the command (");
  write(s.root, "run-tests.sh", "echo ' 1 pass'\nexit 0\n");
  expect(
    (await recordTdd(s.paths, s.work, s.evidence, s.profile, s.preserve.id, "before")).ok,
  ).toBe(true);
  write(s.root, "run-tests.sh", parse);
  const after = await recordTdd(s.paths, s.work, s.evidence, s.profile, s.preserve.id, "after");
  expect(after.ok).toBe(false);
  expect(after.message).toContain("the shell could not parse the command (");
});

test("AC-2 (finding 148): the refusal of a test that passes before the change names a test that fails first and crew tdd observed", async () => {
  const s = setup();
  write(s.root, "run-tests.sh", "echo ' 1 pass'\nexit 0\n");
  const red = await recordTdd(s.paths, s.work, s.evidence, s.profile, s.behaviour.id, "red");
  expect(red.ok).toBe(false);
  expect(red.message).toBe(
    `the test passed before the change; a test that passes before the code exists proves nothing: write a test that fails first, or, for what an end-to-end run or a person checks, prove it with crew tdd observed ${s.work.id} ${s.behaviour.id} -- <command> (a criterion of kind observed)`,
  );
  expect(s.evidence.tdd).toEqual([]);
});

test("AC-12 (finding 153): a red, green, before or after whose command is no test run is refused before it runs, and records nothing", async () => {
  const s = setup();
  const failing = 'import { expect, test } from "bun:test";\ntest("x", () => expect(1).toBe(2));\n';
  write(s.root, "x.test.ts", failing);
  write(s.root, "pkg/a.test.ts", failing);
  write(s.root, "node_modules/.bin/jest", "#!/bin/sh\nexit 1\n");
  chmodSync(join(s.root, "node_modules/.bin/jest"), 0o755);
  write(s.root, "tests/run.sh", "exit 1\n");
  write(s.root, "tests/x.sh", "exit 1\n");
  write(s.root, "README.md", "exit 1\n");
  write(s.root, "build.ts", "process.exit(1);\n");
  const outside = `${basename(s.root)}-outside.sh`;
  writeFileSync(join(s.root, "..", outside), "exit 1\n");
  symlinkSync(join(s.root, "..", outside), join(s.root, "tests/link.test.sh"));
  const refusal =
    /^the command is no test run: .+; run the test \(a runner in its test form, or an interpreter on a test file\) before recording$/;
  const refused = [
    "sh -c 'exit 1'",
    "false",
    "true",
    "exit 1",
    "echo x",
    "cat package.json",
    "ls src",
    "git status",
    "npm run build",
    "npx true",
    "mvn clean",
    "false package.json",
    "sh -c 'exit 1' tests/x.sh",
    "exit 1; bun test",
    "false && bun test",
    "false || bun --version",
    "sh -c 'echo x; bun test'",
    "sh README.md",
    "node package.json",
    "bun run build.ts",
    "sh tests",
    `sh ../${outside}`,
    "sh tests/link.test.sh",
    "bun test $(touch m)",
    "sh -c 'touch m; exit 1'",
    // After the test only `| tee` or `| cat` (the test-quality review's F-1).
    "bun test x.test.ts | sh",
    "bun test x.test.ts; echo x",
    "bun test x.test.ts && touch m",
    "bun test x.test.ts || true",
  ];
  for (const command of refused) {
    const out = await recordTdd(
      s.paths,
      s.work,
      s.evidence,
      s.profile,
      s.behaviour.id,
      "red",
      command,
    );
    expect(out.ok, command).toBe(false);
    expect(out.message, command).toMatch(refusal);
    expect(out.record, command).toBeUndefined();
  }
  expect(existsSync(join(s.root, "m"))).toBe(false);
  expect(s.evidence.tdd).toEqual([]);
  // The same refusal on green, before and after, as words too.
  for (const step of ["green", "before", "after"] as const) {
    const id = step === "green" ? s.behaviour.id : s.preserve.id;
    const out = await recordTdd(s.paths, s.work, s.evidence, s.profile, id, step, [
      "sh",
      "-c",
      "exit 0",
    ]);
    expect(out.message, step).toMatch(refusal);
  }
  const accepted = [
    "bun test x.test.ts",
    "sh -c 'bun test x.test.ts'",
    "cd pkg && bun test",
    "CI=1 bun test",
    "env CI=1 bun test x.test.ts",
    "./node_modules/.bin/jest",
    "bun test x.test.ts | tee log",
    "bun test x.test.ts | cat",
    "sh tests/run.sh",
    "export CI=1; bun test x.test.ts",
    "set -e; bun test x.test.ts",
  ];
  for (const command of accepted) {
    const fresh = setup();
    for (const [rel, text] of Object.entries({
      "x.test.ts": failing,
      "pkg/a.test.ts": failing,
      "tests/run.sh": "exit 1\n",
      "node_modules/.bin/jest": "#!/bin/sh\nexit 1\n",
    }))
      write(fresh.root, rel, text);
    chmodSync(join(fresh.root, "node_modules/.bin/jest"), 0o755);
    const out = await recordTdd(
      fresh.paths,
      fresh.work,
      fresh.evidence,
      fresh.profile,
      fresh.behaviour.id,
      "red",
      command,
    );
    expect(out.message, command).not.toMatch(refusal);
    // A pipe ends in tee or cat, which pass: the run is a test, refused only because it passed.
    if (!/\| (?:tee|cat)\b/.test(command)) expect(out.ok, `${command}: ${out.message}`).toBe(true);
  }
  // Every runner form and test-file name the rule names, read without running anything.
  for (const name of [
    "a.spec.js",
    "a_test.go",
    "a-test.sh",
    "UserTest.php",
    "UserTests.cs",
    "test_a.py",
  ])
    write(s.root, `src/${name}`, "x\n");
  write(s.root, "src/plain.js", "x\n");
  for (const command of [
    "deno test",
    "go test ./...",
    "cargo test",
    "dotnet test",
    "swift test",
    "composer test",
    "make test",
    "mvn -q verify",
    "./gradlew check",
    "gradle :app:test",
    "bundle exec rspec",
    "bundle exec rake test",
    "rspec spec/a_spec.rb",
    "php artisan test",
    "vendor/bin/phpunit",
    "pest",
    "pytest -q",
    "python3 -m pytest",
    "python -m unittest",
    "npx jest",
    "bunx vitest run",
    "npm run test:unit",
    "pnpm --filter api test",
    "yarn test",
    "bun run test",
    "node --test",
    "mocha",
    "ava",
    "node src/a.spec.js",
    "sh src/a-test.sh",
    "php src/UserTest.php",
    "python3 src/test_a.py",
    "ruby src/a_test.go",
    "bash src/UserTests.cs",
  ])
    expect(testRunRefusal(command, s.root, null), command).toBeNull();
  for (const command of [
    "node src/plain.js",
    "go build",
    "cargo build",
    "mvn clean",
    "npx tsc",
    "yarn build",
    "make",
    "python -m http.server",
  ])
    expect(testRunRefusal(command, s.root, null), command).not.toBeNull();
  // The profile's command with arguments of its own counts; with another command after it, the
  // rest is read like any command (the security review's F-1).
  expect(testRunRefusal("make check --keep-going", s.root, "make check")).toBeNull();
  for (const command of [
    "make check; exit 1",
    "make check && true",
    "make check | sh",
    "make check $(touch m)",
  ])
    expect(testRunRefusal(command, s.root, "make check"), command).not.toBeNull();
  // A plugin's own tests, read without running claude (finding 89: no test starts the real binary).
  expect(testRunRefusal("claude plugin test plugins/core", s.root, null)).toBeNull();
  expect(testRunRefusal("claude plugin validate plugins/core", s.root, null)).not.toBeNull();
  // The profile's own test command after -- is the project's test run.
  const own = (s.profile.targets[0] as Target).gates.test?.command ?? "";
  const mine = await recordTdd(s.paths, s.work, s.evidence, s.profile, s.behaviour.id, "red", own);
  expect(mine.ok, mine.message).toBe(true);
  // No -- runs the profile's command; observed keeps its own rule.
  const observed = addCriterion(s.work, "seen", "observed");
  const seen = await recordTdd(
    s.paths,
    s.work,
    s.evidence,
    s.profile,
    observed.id,
    "observed",
    "exit 0",
    "no red run can exist",
  );
  expect(seen.ok, seen.message).toBe(true);
});

// Finding 179 (2026-10-27-001): the record's history, the runners' counts and the pair as one run.

test("F179 AC-1: a step recorded over an earlier record of the same step keeps the earlier runs in its history, oldest first, and the latest decides", async () => {
  const s = setup();
  const entry = () => s.evidence.tdd.find((t) => t.criterion === s.preserve.id);
  const script = (count: number) =>
    write(s.root, "run-tests.sh", `echo ' ${count} pass'\nexit 0\n`);
  // Three befores on the base (the test script alone changed, which finding 79's rule allows): the first two kept in order.
  for (const count of [2, 3, 4]) {
    script(count);
    expect(
      (await recordTdd(s.paths, s.work, s.evidence, s.profile, s.preserve.id, "before")).ok,
    ).toBe(true);
  }
  expect(entry()?.befores?.map((r) => r.passed)).toEqual([2, 3]);
  expect(entry()?.before?.passed).toBe(4);
  // Three afters, the first with the before's own count (the equal case is recorded): the first two kept in order, the latest decides.
  for (const count of [4, 5, 6]) {
    script(count);
    expect(
      (await recordTdd(s.paths, s.work, s.evidence, s.profile, s.preserve.id, "after")).ok,
    ).toBe(true);
  }
  expect(entry()?.afters?.map((r) => r.passed)).toEqual([4, 5]);
  expect(entry()?.after?.passed).toBe(6);
  expect(tddDone(entry(), "preserve")).toBe(true);
  // A red over a red (finding 29's rule) and three greens.
  const behaviour = () => s.evidence.tdd.find((t) => t.criterion === s.behaviour.id);
  write(s.root, "run-tests.sh", "echo ' 0 pass'\necho ' 1 fail'\nexit 1\n");
  expect((await recordTdd(s.paths, s.work, s.evidence, s.profile, s.behaviour.id, "red")).ok).toBe(
    true,
  );
  expect((await recordTdd(s.paths, s.work, s.evidence, s.profile, s.behaviour.id, "red")).ok).toBe(
    true,
  );
  for (const count of [1, 2, 3]) {
    script(count);
    expect(
      (await recordTdd(s.paths, s.work, s.evidence, s.profile, s.behaviour.id, "green")).ok,
    ).toBe(true);
  }
  expect(behaviour()?.reds).toHaveLength(1);
  expect(behaviour()?.greens?.map((r) => r.passed)).toEqual([1, 2]);
  expect(behaviour()?.green?.passed).toBe(3);
  // An observed recorded three times keeps its earlier runs the same way.
  const seen = addCriterion(s.work, "seen", "observed");
  for (const count of [1, 2, 3]) {
    script(count);
    const observed = await recordTdd(
      s.paths,
      s.work,
      s.evidence,
      s.profile,
      seen.id,
      "observed",
      undefined,
      "a measurement",
    );
    expect(observed.ok).toBe(true);
  }
  const seenRecord = s.evidence.tdd.find((t) => t.criterion === seen.id);
  expect(seenRecord?.observeds?.map((r) => r.passed)).toEqual([1, 2]);
  expect(seenRecord?.observed?.passed).toBe(3);
});

test("F179 AC-6: an after over another command, with fewer passing tests, or with no count after a counted before is refused with nothing recorded; the same command with more tests, and any after on a before without a count, are recorded", async () => {
  const s = setup();
  const entry = () => s.evidence.tdd.find((t) => t.criterion === s.preserve.id);
  const logs = () => {
    const dir = join(workDir(s.paths, s.work.id), "logs");
    return existsSync(dir)
      ? readdirSync(dir).filter((n) => n.startsWith(`tdd-${s.preserve.id}-after-`))
      : [];
  };
  write(s.root, "run-tests.sh", "echo ' 3 pass'\nexit 0\n");
  expect(
    (await recordTdd(s.paths, s.work, s.evidence, s.profile, s.preserve.id, "before")).ok,
  ).toBe(true);
  // Another command (the profile's own is `npm run test`, the detector's guess for the script): refused before anything runs, no log, nothing recorded.
  write(s.root, "tests/other.test.sh", "echo ' 9 pass'\ntouch other-ran.txt\nexit 0\n");
  const other = await recordTdd(
    s.paths,
    s.work,
    s.evidence,
    s.profile,
    s.preserve.id,
    "after",
    "sh tests/other.test.sh",
  );
  expect(other.ok).toBe(false);
  expect(other.message).toBe(
    `the after must run the before's command (npm run test): the pair proves the tests the before ran still pass; run that command, or make ${s.preserve.id} observed with the reason`,
  );
  expect(other.record).toBeUndefined();
  expect(existsSync(join(s.root, "other-ran.txt"))).toBe(false);
  expect(logs()).toEqual([]);
  expect(entry()?.after).toBeUndefined();
  // The same command with the before's own count: recorded (the boundary is equal or higher).
  expect((await recordTdd(s.paths, s.work, s.evidence, s.profile, s.preserve.id, "after")).ok).toBe(
    true,
  );
  expect(entry()?.after?.passed).toBe(3);
  // Fewer passing tests: refused after the run, the record as it was.
  write(s.root, "run-tests.sh", "echo ' 2 pass'\nexit 0\n");
  const fewer = await recordTdd(s.paths, s.work, s.evidence, s.profile, s.preserve.id, "after");
  expect(fewer.ok).toBe(false);
  expect(fewer.message).toBe(
    `the after passed fewer tests than the before (3 → 2): a test the before counted is gone; restore it, or make ${s.preserve.id} observed with the reason`,
  );
  expect(fewer.record?.passed).toBe(2);
  expect(entry()?.after?.passed).toBe(3);
  expect(entry()?.afters).toBeUndefined();
  // No count after a counted before: refused, nothing recorded.
  write(s.root, "run-tests.sh", "echo 'all good'\nexit 0\n");
  const lost = await recordTdd(s.paths, s.work, s.evidence, s.profile, s.preserve.id, "after");
  expect(lost.ok).toBe(false);
  expect(lost.message).toBe(
    `the after reported no count though the before did (3): its summary was lost (a test that exits early, an output cut short); run it again, or make ${s.preserve.id} observed with the reason`,
  );
  expect(entry()?.after?.passed).toBe(3);
  // A run with a failure is refused by the failed-run rule before any count is compared, whatever its passed figure.
  write(s.root, "run-tests.sh", "echo '      Tests  1 failed | 11 passed (12)'\nexit 1\n");
  const failing = await recordTdd(s.paths, s.work, s.evidence, s.profile, s.preserve.id, "after");
  expect(failing.ok).toBe(false);
  expect(failing.message).toBe("after run failed (exit 1); nothing recorded");
  expect(failing.record?.passed).toBe(11);
  expect(entry()?.after?.passed).toBe(3);
  // More passing tests: recorded with its count, the equal one kept in the history.
  write(s.root, "run-tests.sh", "echo ' 4 pass'\nexit 0\n");
  expect((await recordTdd(s.paths, s.work, s.evidence, s.profile, s.preserve.id, "after")).ok).toBe(
    true,
  );
  expect(entry()?.after?.passed).toBe(4);
  expect(entry()?.afters?.map((r) => r.passed)).toEqual([3]);
  // A before without a count takes an after with one or without.
  const keep = addCriterion(s.work, "keep too", "preserve");
  write(s.root, "run-tests.sh", "echo 'all good'\nexit 0\n");
  expect((await recordTdd(s.paths, s.work, s.evidence, s.profile, keep.id, "before")).ok).toBe(
    true,
  );
  write(s.root, "run-tests.sh", "echo ' 1 pass'\nexit 0\n");
  expect((await recordTdd(s.paths, s.work, s.evidence, s.profile, keep.id, "after")).ok).toBe(true);
  write(s.root, "run-tests.sh", "echo 'all good'\nexit 0\n");
  expect((await recordTdd(s.paths, s.work, s.evidence, s.profile, keep.id, "after")).ok).toBe(true);
});

test("F179 AC-5: passCount reads the runner's own summary line (bun, vitest, jest, pytest, PHPUnit), the last match wins, and a recorded run carries the count", async () => {
  expect(
    passCount("bun test v1.3.9\n\n 334 pass\n 0 fail\nRan 334 tests across 7 files. [1.00s]"),
  ).toBe(334);
  // A test's own line that looks like the summary can precede it, never follow it: the last match is the runner's.
  expect(
    passCount("999 pass\n 999 pass\n 334 pass\n 0 fail\nRan 334 tests across 7 files. [1.00s]"),
  ).toBe(334);
  expect(passCount("    334 pass\n")).toBeNull();
  expect(passCount("Ran 334 tests across 7 files. [1.00s]")).toBeNull();
  expect(passCount("")).toBeNull();
  expect(
    passCount(
      " Test Files  1 passed (1)\n      Tests  11 passed | 1 skipped (12)\n   Start at  10:00:00\n   Duration  1.2s",
    ),
  ).toBe(11);
  expect(
    passCount(
      "Tests:       1 skipped, 3 passed, 4 total\nSnapshots:   0 total\nTime:        1.2 s",
    ),
  ).toBe(3);
  expect(passCount("Tests:       3 passed, 1 skipped, 4 total")).toBe(3);
  expect(
    passCount(
      " Test Files  1 passed (1)\n      Tests  1 skipped | 11 passed (12)\n   Duration  1.2s",
    ),
  ).toBe(11);
  expect(passCount("============ 3 passed, 1 skipped in 0.12s ============")).toBe(3);
  expect(passCount("=== 3 passed in 0.12s ===")).toBe(3);
  expect(passCount("===== 3 passed in 61.00s (0:01:01) =====")).toBe(3);
  expect(
    passCount(
      "PHPUnit 11.0\n\n.....\n\nTime: 00:00.012, Memory: 6.00 MB\n\nOK (5 tests, 9 assertions)",
    ),
  ).toBe(5);
  expect(passCount("OK, but there were issues!\nTests: 5, Assertions: 9, Skipped: 1.")).toBe(5);
  // The `Tests:` form is read only when no passed form matched, wherever the lines sit.
  expect(passCount("Tests: 7, Assertions: 9.\nOK (5 tests, 9 assertions)")).toBe(5);
  expect(passCount("OK (5 tests, 9 assertions)\nTests: 7, Assertions: 9.")).toBe(5);
  // A recorded run carries it; a run without a summary has none.
  const s = setup();
  write(s.root, "run-tests.sh", "echo ' 0 pass'\necho ' 1 fail'\nexit 1\n");
  expect((await recordTdd(s.paths, s.work, s.evidence, s.profile, s.behaviour.id, "red")).ok).toBe(
    true,
  );
  expect(s.evidence.tdd[0]?.red?.passed).toBe(0);
  write(s.root, "run-tests.sh", "echo ' 2 pass'\nexit 0\n");
  expect(
    (await recordTdd(s.paths, s.work, s.evidence, s.profile, s.behaviour.id, "green")).ok,
  ).toBe(true);
  expect(s.evidence.tdd[0]?.green?.passed).toBe(2);
  write(s.root, "run-tests.sh", "echo 'all good'\nexit 0\n");
  expect(
    (await recordTdd(s.paths, s.work, s.evidence, s.profile, s.preserve.id, "before")).ok,
  ).toBe(true);
  expect(s.evidence.tdd[1]?.before?.passed).toBeUndefined();
});
