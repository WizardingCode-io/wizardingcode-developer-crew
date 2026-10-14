import { expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { workDir } from "../src/paths.ts";
import { DEFAULT_POLICY } from "../src/policy.ts";
import { loadState } from "../src/state.ts";
import type { Evidence, RunRecord } from "../src/types.ts";
import {
  activeWork,
  addCriterion,
  addSkip,
  advancePhase,
  applyClassification,
  approve,
  createWork,
  type GuardContext,
  guardFor,
  hasAcceptanceSection,
  loadWork,
  missingConclaveSections,
  PHASES_BY_ROUTE,
  raiseRoute,
  removeCriterion,
  saveWork,
} from "../src/work.ts";
import { git, makeRepo, repoPaths, tempDir, testEnv } from "./helpers.ts";

const run: RunRecord = {
  command: "x",
  exit: 0,
  at: "t",
  durationMs: 1,
  log: "l",
  tail: "",
  timedOut: false,
};
const empty: GuardContext = {
  specText: null,
  conclaveText: null,
  planExists: false,
  evidence: null,
  proven: false,
  unproven: [],
  policy: DEFAULT_POLICY,
};

test("createWork writes the item and the brief and makes it active", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "The cart total ignores the discount\n\nSteps: add a coupon.");
  expect(work.id).toMatch(/^\d{4}-\d{2}-\d{2}-001-the-cart-total-ignores-the-discount$/);
  expect(work.title).toBe("The cart total ignores the discount");
  expect(work.phase).toBe("receive");
  expect(existsSync(join(workDir(paths, work.id), "work.json"))).toBe(true);
  expect(readFileSync(join(workDir(paths, work.id), "brief.md"), "utf8")).toContain("add a coupon");
  expect(loadState(paths).active).toBe(work.id);
  expect(activeWork(paths)?.work?.id).toBe(work.id);
  expect(createWork(paths, "Second").id).toMatch(/-002-second$/);
});

test("classification sets type, route and risk, and routes only go up", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "fix");
  applyClassification(work, "fix", { route: "fast", reasons: ["r"], riskAreas: [] });
  expect(work).toMatchObject({ type: "fix", route: "fast", phase: "recognize" });
  expect(raiseRoute(work, "full", "touches app/Auth")).toBe(true);
  expect(work.routeReasons).toEqual(["r", "raised to full: touches app/Auth"]);
  expect(raiseRoute(work, "standard", "x")).toBe(false);
  saveWork(paths, work);
  expect(loadWork(paths, work.id).work?.route).toBe("full");
});

test("criteria ids are never reused: a removed criterion keeps its number", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "fix");
  addCriterion(work, "a");
  addCriterion(work, "b");
  const evidence: Evidence = {
    fingerprint: null,
    tdd: [],
    runs: [],
    verdict: "unproven",
    unproven: [],
  };
  expect(removeCriterion(work, evidence, "AC-2")).toMatchObject({
    removed: { id: "AC-2", kind: "behavior", text: "b" },
  });
  expect(work.criteria.map((c) => c.id)).toEqual(["AC-1"]);
  expect(work.removedCriteria?.map((r) => r.id)).toEqual(["AC-2"]);
  expect(addCriterion(work, "c").id).toBe("AC-3");
  expect(removeCriterion(work, evidence, "AC-2")).toEqual({
    refused: "unknown criterion: AC-2",
  });
});

test("guards: build needs criteria, then spec, approval and plan by route", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "feature");
  applyClassification(work, "feature", { route: "fast", reasons: [], riskAreas: [] });
  expect(guardFor(work, "build", empty)).toEqual([
    'at least one acceptance criterion (crew criteria <id> add "...")',
  ]);
  addCriterion(work, "The total subtracts the discount.");
  expect(guardFor(work, "build", empty)).toEqual([]);
  work.route = "full";
  expect(guardFor(work, "build", empty)).toEqual([
    "spec.md in the work folder",
    "the user's approval of the spec (crew approve <id> spec)",
    "plan.md in the work folder",
  ]);
  expect(hasAcceptanceSection("# Spec\n\n## Acceptance criteria\n\n- AC-1 x\n")).toBe(true);
  expect(hasAcceptanceSection("# Spec\n\n## Acceptance criteria\n\n## Risks\n")).toBe(false);
  approve(work, "spec");
  const ready = { ...empty, specText: "## Acceptance criteria\n- x\n", planExists: true };
  expect(guardFor(work, "build", ready)).toEqual([]);
});

test("guards: gate needs test-first records per criterion kind, deliver needs proof", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "refactor");
  // The fast route has no spec, so only the test-first records and the proof are guarded here.
  work.route = "fast";
  const behaviour = addCriterion(work, "x");
  const preserve = addCriterion(work, "keep", "preserve");
  expect(guardFor(work, "gate", empty)).toEqual([
    `test-first record for ${behaviour.id} (crew tdd red/green)`,
    `test-first record for ${preserve.id} (crew tdd before/after)`,
  ]);
  const evidence: Evidence = {
    fingerprint: "f",
    tdd: [
      { criterion: behaviour.id, red: run, green: run },
      { criterion: preserve.id, before: run },
    ],
    runs: [],
    verdict: "unproven",
    unproven: [],
  };
  expect(guardFor(work, "gate", { ...empty, evidence })).toEqual([
    `test-first record for ${preserve.id} (crew tdd before/after)`,
  ]);
  addSkip(work, `tdd:${preserve.id}`, "manual check");
  expect(guardFor(work, "gate", { ...empty, evidence })).toEqual([]);
  expect(guardFor(work, "deliver", { ...empty, unproven: ["gate test failing"] })).toEqual([
    "not proven: gate test failing",
  ]);
  expect(guardFor(work, "deliver", { ...empty, proven: true })).toEqual([]);
});

test("guards: an agent's approval or skip counts only when the policy says so", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "feature");
  const criterion = addCriterion(work, "x");
  work.route = "full";
  const ready: GuardContext = {
    ...empty,
    specText: "## Acceptance criteria\n- x\n",
    planExists: true,
  };
  approve(work, "spec", { by: "agent", mode: "auto" });
  expect(guardFor(work, "build", ready)).toEqual([
    'the user\'s approval of the spec: recorded by the agent in auto mode and not counted (a person runs crew approve <id> spec, or policy.json sets unattendedDecisions to "count")',
  ]);
  const counting: GuardContext = {
    ...ready,
    policy: { ...DEFAULT_POLICY, unattendedDecisions: "count" },
  };
  expect(guardFor(work, "build", counting)).toEqual([]);
  addSkip(work, `tdd:${criterion.id}`, "no test", { by: "agent", mode: "dontAsk" });
  expect(guardFor(work, "gate", ready)).toContain(
    `test-first record for ${criterion.id} (crew tdd red/green)`,
  );
  expect(guardFor(work, "gate", counting)).toEqual([]);
});

test("I2: a route raised during build is felt at the gate and at delivery", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "fix");
  applyClassification(work, "fix", { route: "fast", reasons: ["r"], riskAreas: [] });
  const criterion = addCriterion(work, "x");
  expect(advancePhase(work, empty)).toEqual({ ok: true, phase: "build" });
  raiseRoute(work, "full", "the change touches auth paths");
  const evidence: Evidence = {
    fingerprint: "f",
    tdd: [{ criterion: criterion.id, red: run, green: run }],
    runs: [],
    verdict: "proven",
    unproven: [],
  };
  const atGate = advancePhase(work, { ...empty, evidence });
  expect(atGate).toEqual({
    ok: false,
    missing: [
      "spec.md in the work folder",
      "the user's approval of the spec (crew approve <id> spec)",
      "plan.md in the work folder",
    ],
  });
  expect(guardFor(work, "deliver", { ...empty, evidence, proven: true })).toContain(
    "spec.md in the work folder",
  );
  approve(work, "spec");
  const ready = { ...empty, evidence, specText: "## Acceptance criteria\n- x\n", planExists: true };
  expect(advancePhase(work, ready)).toEqual({ ok: true, phase: "gate" });
  expect(guardFor(work, "deliver", { ...ready, proven: true })).toEqual([]);
});

test("I2: classifying again never lowers the route and keeps every risk area", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "fix");
  applyClassification(work, "fix", { route: "full", reasons: ["risk"], riskAreas: ["auth"] });
  applyClassification(work, "fix", { route: "fast", reasons: ["calm"], riskAreas: [] });
  expect(work.route).toBe("full");
  expect(work.riskAreas).toEqual(["auth"]);
  applyClassification(work, "fix", {
    route: "full",
    reasons: ["payments"],
    riskAreas: ["payments"],
  });
  expect(work.riskAreas).toEqual(["auth", "payments"]);
});

test("I1: a work item records the commit its change is measured from", () => {
  const root = makeRepo();
  const paths = repoPaths(root, testEnv());
  expect(createWork(paths, "x").baseCommit).toBe(git(root, "rev-parse", "HEAD"));
  const plain = tempDir();
  mkdirSync(join(plain, ".crew"));
  expect(createWork(repoPaths(plain, testEnv()), "y").baseCommit).toBeNull();
});

test("SP2a: the conclave sits between specify and plan on standard and full, not on fast", () => {
  expect(PHASES_BY_ROUTE.fast).toEqual(["receive", "recognize", "build", "gate", "deliver"]);
  expect(PHASES_BY_ROUTE.standard).toEqual([
    "receive",
    "recognize",
    "understand",
    "specify",
    "conclave",
    "plan",
    "build",
    "gate",
    "deliver",
  ]);
  expect(PHASES_BY_ROUTE.full).toEqual(PHASES_BY_ROUTE.standard);
});

test("SP2a: plan needs conclave.md with content under the four headings; 'none' is content", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "feature");
  applyClassification(work, "feature", { route: "standard", reasons: [], riskAreas: [] });
  work.phase = "conclave";
  expect(guardFor(work, "plan", empty)).toEqual([
    "conclave.md in the work folder (the gap round: four sections)",
  ]);
  const partial =
    "# Gap round\n\n## Assumed by good practice\n- auth\n\n## Decisions only the user can make\n\n## Proposals\nnone\n";
  expect(missingConclaveSections(partial)).toEqual([
    "Decisions only the user can make",
    "Warnings",
  ]);
  expect(guardFor(work, "plan", { ...empty, conclaveText: partial })).toEqual([
    'a "Decisions only the user can make" section with content in conclave.md (write "none" when there is nothing)',
    'a "Warnings" section with content in conclave.md (write "none" when there is nothing)',
  ]);
  const full =
    "# Gap round\n\n## Assumed by good practice\n- auth\n\n## Decisions only the user can make\n- D-1 which roles\n\n## Proposals\nnone\n\n## Warnings\nnone\n";
  expect(missingConclaveSections(full)).toEqual([]);
  expect(guardFor(work, "plan", { ...empty, conclaveText: full })).toEqual([]);
  work.route = "fast";
  expect(guardFor(work, "plan", empty)).toEqual([]);
});

test("advancePhase follows the route and stops at a failing guard", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "fix");
  applyClassification(work, "fix", { route: "fast", reasons: [], riskAreas: [] });
  expect(advancePhase(work, empty)).toEqual({
    ok: false,
    missing: ['at least one acceptance criterion (crew criteria <id> add "...")'],
  });
  addCriterion(work, "x");
  expect(advancePhase(work, empty)).toEqual({ ok: true, phase: "build" });
  expect(work.phase).toBe("build");
});
