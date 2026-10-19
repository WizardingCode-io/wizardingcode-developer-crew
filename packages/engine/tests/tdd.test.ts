import { expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { tddDone } from "../src/criteria.ts";
import { detectProfile } from "../src/detect/index.ts";
import { emptyEvidence } from "../src/evidence.ts";
import { recordTdd as record } from "../src/tdd.ts";
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
  const missing = await recordTdd(
    s.paths,
    s.work,
    s.evidence,
    s.profile,
    s.behaviour.id,
    "red",
    "exit 127",
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
    "exit 126",
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
    "sleep 5",
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
  const red = await recordTdd(
    s.paths,
    s.work,
    s.evidence,
    s.profile,
    s.behaviour.id,
    "red",
    "exit 7",
  );
  expect(red.ok).toBe(true);
  expect(s.evidence.tdd[0]?.red?.command).toBe("exit 7");
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
