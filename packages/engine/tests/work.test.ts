import { expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { emptyEvidence } from "../src/evidence.ts";
import { addObjection, bindObjection } from "../src/objections.ts";
import { workDir } from "../src/paths.ts";
import { DEFAULT_POLICY } from "../src/policy.ts";
import { loadState } from "../src/state.ts";
import { plannedSeats } from "../src/team.ts";
import type { Evidence, ObjectionLedger, RunRecord } from "../src/types.ts";
import { validationHash } from "../src/validation.ts";
import {
  activeWork,
  addCriterion,
  addDecision,
  addSkip,
  advancePhase,
  answerDecision,
  applyClassification,
  approve,
  closeDebate,
  createWork,
  debateState,
  type GuardContext,
  guardFor,
  hasAcceptanceSection,
  loadWork,
  missingConclaveSections,
  openDebate,
  PHASES_BY_ROUTE,
  raiseRoute,
  removeCriterion,
  saveWork,
  validatorPreconditions,
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
  ledger: null,
  planExists: false,
  evidence: null,
  proven: false,
  unproven: [],
  policy: DEFAULT_POLICY,
};

test("SP2b: the debate opens once with a reason, closes with its cost, and holds the plan while open", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "feature");
  applyClassification(work, "feature", { route: "standard", reasons: [], riskAreas: [] });
  work.phase = "conclave";
  const conclave =
    "## Assumed by good practice\nnone\n## Decisions only the user can make\nnone\n## Proposals\nnone\n## Warnings\nnone\n";
  const ctx = { ...empty, conclaveText: conclave };
  expect(debateState(work)).toBe("none");
  expect(guardFor(work, "plan", ctx)).toEqual([]);
  expect(openDebate(work, "  ")).toEqual({
    refused: "a debate opens for a reason: the decision with consequences",
  });
  expect(openDebate(work, "which models are hard-deleted")).toMatchObject({
    reason: "which models are hard-deleted",
  });
  expect(debateState(work)).toBe("open");
  expect(guardFor(work, "plan", ctx)).toEqual([
    "the debate is open (which models are hard-deleted); close it with the judge's ruling (crew debate <id> close [--tokens n])",
  ]);
  expect(openDebate(work, "again")).toMatchObject({
    refused: expect.stringContaining("the debate is already open"),
  });
  expect(closeDebate(work, 5400)).toMatchObject({ tokens: 5400 });
  expect(typeof work.debate?.closedAt).toBe("string");
  expect(debateState(work)).toBe("closed");
  expect(guardFor(work, "plan", ctx)).toEqual([]);
  expect(closeDebate(work)).toEqual({ refused: "the debate is already closed" });
  expect(openDebate(work, "once more")).toEqual({
    refused: "the debate is closed; it opens once per item",
  });
  expect(closeDebate(createWork(paths, "other"))).toEqual({
    refused: 'no debate is open (crew debate <id> open --reason "<why>")',
  });
  saveWork(paths, work);
  expect(loadWork(paths, work.id).work?.debate).toMatchObject({
    reason: "which models are hard-deleted",
    tokens: 5400,
  });
});

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

test("SP2a: decisions are numbered once, answered by the user or by the validator's default, and guard plan", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "feature");
  applyClassification(work, "feature", { route: "standard", reasons: [], riskAreas: [] });
  work.phase = "conclave";
  const conclave =
    "## Assumed by good practice\nnone\n## Decisions only the user can make\nD-1\n## Proposals\nnone\n## Warnings\nnone\n";
  const ctx = { ...empty, conclaveText: conclave };
  const d1 = addDecision(work, "Which roles get the create permission?", "admins only");
  const d2 = addDecision(work, "Remove the legacy route now?");
  expect([d1.id, d2.id]).toEqual(["D-1", "D-2"]);
  expect(guardFor(work, "plan", ctx)).toEqual([
    'an answer to D-1 (crew decide <id> D-1 "<answer>")',
    'an answer to D-2 (crew decide <id> D-2 "<answer>")',
  ]);
  // The validator takes only a stated default, under its rule; another answer, or no default, is refused.
  const validator = {
    by: "validator" as const,
    mode: "dontAsk" as const,
    rule: "stated-default" as const,
  };
  expect(answerDecision(work, "D-1", "everyone", validator)).toEqual({
    refused: "the validator may only take the stated default of D-1 (admins only)",
  });
  expect(answerDecision(work, "D-2", undefined, validator)).toEqual({
    refused: "D-2 has no stated default; a person answers it",
  });
  expect(answerDecision(work, "D-1", undefined, validator)).toMatchObject({
    answer: "admins only",
    by: "validator",
  });
  // Under policy wait the validator's answer does not count; under validator it does.
  expect(guardFor(work, "plan", ctx)).toEqual([
    'an answer to D-1 (crew decide <id> D-1 "<answer>")',
    'an answer to D-2 (crew decide <id> D-2 "<answer>")',
  ]);
  const counting = {
    ...ctx,
    policy: { ...DEFAULT_POLICY, unattendedDecisions: "validator" as const },
  };
  expect(guardFor(work, "plan", counting)).toEqual([
    'an answer to D-2 (crew decide <id> D-2 "<answer>")',
  ]);
  expect(answerDecision(work, "D-2", "yes, 410", { by: "user" })).toMatchObject({
    answer: "yes, 410",
    by: "user",
  });
  expect(guardFor(work, "plan", counting)).toEqual([]);
  expect(answerDecision(work, "D-9", "x", { by: "user" })).toEqual({
    refused: "unknown decision: D-9",
  });
});

test("SP2a: plan needs every blocking objection bound or waived; a bound criterion cannot be removed", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "feature");
  applyClassification(work, "feature", { route: "standard", reasons: [], riskAreas: [] });
  work.phase = "conclave";
  const ac = addCriterion(work, "the sync is gated");
  const conclave =
    "## Assumed by good practice\nnone\n## Decisions only the user can make\nnone\n## Proposals\nnone\n## Warnings\nnone\n";
  const ledger: ObjectionLedger = { objections: [] };
  const o1 = addObjection(
    ledger,
    "the sync would re-subscribe everyone",
    "fault-finder",
    "blocking",
  );
  addObjection(ledger, "consider a webhook", "expert", "advisory");
  const ctx = { ...empty, conclaveText: conclave, ledger };
  expect(guardFor(work, "plan", ctx)).toEqual([
    'a criterion bound to blocking objection O-1, or the user\'s waiver (crew objection <id> resolve O-1 --criterion AC-k | waive O-1 --reason "<why>")',
  ]);
  bindObjection(ledger, work, o1.id, ac.id);
  expect(guardFor(work, "plan", ctx)).toEqual([]);
  const evidence: Evidence = {
    fingerprint: "f",
    tdd: [],
    runs: [],
    verdict: "unproven",
    unproven: [],
  };
  expect(removeCriterion(work, evidence, ac.id, ledger)).toEqual({
    refused: `${ac.id} is bound to objection O-1; it stays`,
  });
});

test("SP2a: the gate guard names the observed step for an observed criterion", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "e2e");
  work.route = "fast";
  const observed = addCriterion(work, "stubbed e2e", "observed");
  expect(guardFor(work, "gate", empty)).toEqual([
    `test-first record for ${observed.id} (crew tdd observed --reason)`,
  ]);
});

test("SP2a: the complete-gap-round rule holds only with the four sections, defaults or answers, and no open blocking objection", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "feature");
  applyClassification(work, "feature", { route: "full", reasons: [], riskAreas: ["auth"] });
  const ac = addCriterion(work, "x");
  const ledger: ObjectionLedger = { objections: [] };
  const o1 = addObjection(ledger, "re-subscribes everyone", "fault-finder", "blocking");
  addDecision(work, "Which roles?");
  const partial =
    "## Assumed by good practice\nnone\n## Decisions only the user can make\nD-1\n## Proposals\nnone\n";
  expect(
    validatorPreconditions("complete-gap-round", work, { ...empty, conclaveText: partial, ledger }),
  ).toEqual([
    'a "Warnings" section with content in conclave.md (write "none" when there is nothing)',
    "a stated default or an answer for D-1",
    "blocking objection O-1 bound to a criterion or waived by a person",
  ]);
  const full = `${partial}## Warnings\nnone\n`;
  answerDecision(work, "D-1", "admins", { by: "user" });
  bindObjection(ledger, work, o1.id, ac.id);
  expect(
    validatorPreconditions("complete-gap-round", work, { ...empty, conclaveText: full, ledger }),
  ).toEqual([]);
  expect(validatorPreconditions("stated-default", work, empty)).toEqual([]);
});

test("SP7a AC-2: on standard and full the plan waits for the mandatory leads' validation of the spec, a changed spec makes it stale, and the phases are stamped", () => {
  const paths = repoPaths(makeRepo({ "src/a.ts": "x" }), testEnv());
  const work = createWork(paths, "Validate me");
  work.route = "standard";
  work.phase = "conclave";
  work.seats = plannedSeats("standard", [], ["src/a.ts"], DEFAULT_POLICY);
  addCriterion(work, "a");
  const spec = "# Spec\n\n## Acceptance criteria\n- AC-1 a\n";
  const conclave =
    "# Conclave: gap round\n\n## Assumed by good practice\n- a\n\n## Decisions only the user can make\n- none\n\n## Proposals\n- none\n\n## Warnings\n- none\n";
  const ctx: GuardContext = { ...empty, specText: spec, conclaveText: conclave };
  const first = advancePhase(work, ctx);
  expect(first.ok).toBe(false);
  if (!first.ok)
    expect(first.missing).toEqual([
      "validation of spec by lead-qa (crew validation <id> record --what spec --by lead-qa --file conclave/lead-qa.md)",
      "validation of spec by lead-security (crew validation <id> record --what spec --by lead-security --file conclave/lead-security.md)",
    ]);
  const hash = validationHash("spec", spec, null, "");
  const at = "2026-10-17T00:00:00.000Z";
  work.validations = [
    {
      what: "spec",
      by: "lead-qa",
      verdict: "validated",
      returns: 0,
      round: 1,
      file: "conclave/lead-qa.md",
      hash,
      at,
    },
    {
      what: "spec",
      by: "lead-security",
      verdict: "returned",
      returns: 1,
      round: 1,
      file: "conclave/lead-security.md",
      hash,
      at,
    },
  ];
  const second = advancePhase(work, ctx);
  expect(second.ok).toBe(false);
  if (!second.ok)
    expect(second.missing).toEqual([
      "validation of spec by lead-security: returned 1 return (conclave/lead-security.md); revise the spec and record the lead again",
    ]);
  const security = work.validations[1];
  if (security) work.validations[1] = { ...security, verdict: "validated", returns: 0 };
  expect(advancePhase(work, ctx)).toEqual({ ok: true, phase: "plan" });
  expect(typeof work.phaseAt?.plan).toBe("string");
  // The spec changed after the validations: stale, asked again.
  work.phase = "conclave";
  const stale = advancePhase(work, { ...ctx, specText: `${spec}- AC-2 b\n` });
  expect(stale.ok).toBe(false);
  if (!stale.ok)
    expect(stale.missing[0]).toBe(
      "validation of spec by lead-qa: stale (spec changed); record the lead again",
    );
  // The delivery waits for the leads too, against the evidence fingerprint.
  work.phase = "gate";
  const evidence = { ...emptyEvidence(), fingerprint: "sha256:feed", verdict: "proven" as const };
  const toDeliver = advancePhase(work, { ...ctx, evidence, proven: true });
  expect(toDeliver.ok).toBe(false);
  if (!toDeliver.ok)
    expect(toDeliver.missing).toEqual([
      "validation of delivery by lead-qa (crew validation <id> record --what delivery --by lead-qa --file conclave/lead-qa.delivery.md)",
      "validation of delivery by lead-security (crew validation <id> record --what delivery --by lead-security --file conclave/lead-security.delivery.md)",
    ]);
  // Delivery validations against the evidence fingerprint open Deliver; another fingerprint is stale.
  const delivery = (by: string, verdict: "validated" | "returned", h: string) => ({
    what: "delivery" as const,
    by,
    verdict,
    returns: verdict === "returned" ? 2 : 0,
    round: 1,
    file: `conclave/${by}.delivery.md`,
    hash: h,
    at,
  });
  const specValidations = work.validations ?? [];
  work.validations = [
    ...specValidations,
    delivery("lead-qa", "validated", "sha256:feed"),
    delivery("lead-security", "validated", "sha256:feed"),
  ];
  expect(advancePhase(work, { ...ctx, evidence, proven: true })).toEqual({
    ok: true,
    phase: "deliver",
  });
  work.phase = "gate";
  const changed = { ...evidence, fingerprint: "sha256:other" };
  const staleDelivery = advancePhase(work, { ...ctx, evidence: changed, proven: true });
  expect(staleDelivery.ok).toBe(false);
  if (!staleDelivery.ok)
    expect(staleDelivery.missing).toEqual([
      "validation of delivery by lead-qa: stale (the evidence changed); record the lead again",
      "validation of delivery by lead-security: stale (the evidence changed); record the lead again",
    ]);
  work.validations = [
    ...specValidations,
    delivery("lead-qa", "validated", "sha256:feed"),
    delivery("lead-security", "returned", "sha256:feed"),
  ];
  const returnedDelivery = advancePhase(work, { ...ctx, evidence, proven: true });
  expect(returnedDelivery.ok).toBe(false);
  if (!returnedDelivery.ok)
    expect(returnedDelivery.missing).toEqual([
      "validation of delivery by lead-security: returned 2 returns (conclave/lead-security.delivery.md); revise the delivery and record the lead again",
    ]);
  // A fast item, and a standard item with no seats recorded, ask for no validation.
  const fast = createWork(paths, "Fast");
  addCriterion(fast, "a");
  fast.phase = "recognize";
  expect(advancePhase(fast, empty).ok).toBe(true);
  const unseated = createWork(paths, "Old standard item");
  unseated.route = "standard";
  unseated.phase = "conclave";
  addCriterion(unseated, "a");
  expect(advancePhase(unseated, ctx)).toEqual({ ok: true, phase: "plan" });
});

test("SP2a review: the validator never overwrites an answer; a person may change theirs", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "feature");
  addDecision(work, "Which roles?", "admins only");
  expect(answerDecision(work, "D-1", "everyone", { by: "user" })).toMatchObject({
    answer: "everyone",
  });
  expect(
    answerDecision(work, "D-1", undefined, {
      by: "validator",
      mode: "dontAsk",
      rule: "stated-default",
    }),
  ).toEqual({
    refused: "D-1 is already answered by the user; the validator never overwrites an answer",
  });
  expect(work.decisions?.[0]).toMatchObject({ answer: "everyone", by: "user" });
  expect(answerDecision(work, "D-1", "admins only", { by: "user" })).toMatchObject({
    answer: "admins only",
    by: "user",
  });
});

test("SP2a review: a section body runs to the next heading of the same or higher level, and any filled occurrence counts", () => {
  const nested =
    "# Gap round\n\n## Assumed by good practice\n### Auth\n- the endpoint is authenticated\n\n## Decisions only the user can make\n### D-1 Which roles?\n- admins only\n\n## Proposals\nnone\n\n## Warnings\nnone\n";
  expect(missingConclaveSections(nested)).toEqual([]);
  const duplicated =
    "## Assumed by good practice\nnone\n## Decisions only the user can make\n\n## Proposals\nnone\n## Warnings\nnone\n\n## Decisions only the user can make\n- D-1 which roles\n";
  expect(missingConclaveSections(duplicated)).toEqual([]);
  const emptyNested =
    "## Assumed by good practice\n### Auth\n\n## Decisions only the user can make\nnone\n## Proposals\nnone\n## Warnings\nnone\n";
  expect(missingConclaveSections(emptyNested)).toEqual(["Assumed by good practice"]);
  expect(hasAcceptanceSection("## Acceptance criteria\n### Behaviour\n- AC-1 x\n## Risks\n")).toBe(
    true,
  );
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
