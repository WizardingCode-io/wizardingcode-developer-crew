import { expect, test } from "bun:test";
import { detectProfile } from "../src/detect/index.ts";
import { emptyEvidence } from "../src/evidence.ts";
import { recordTdd } from "../src/tdd.ts";
import { addCriterion, createWork } from "../src/work.ts";
import { makeRepo, repoPaths, testEnv, write } from "./helpers.ts";

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
