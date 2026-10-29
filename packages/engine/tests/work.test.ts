import { expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { emptyEvidence } from "../src/evidence.ts";
import { addObjection, bindObjection } from "../src/objections.ts";
import { workDir } from "../src/paths.ts";
import { DEFAULT_POLICY } from "../src/policy.ts";
import { loadState } from "../src/state.ts";
import { strategyHash } from "../src/strategy.ts";
import { plannedSeats } from "../src/team.ts";
import type { Evidence, ObjectionLedger, RunRecord, WorkItem } from "../src/types.ts";
import { PHASE_ORDER } from "../src/types.ts";
import { validationHash } from "../src/validation.ts";
import {
  activeWork,
  addCriterion,
  addDecision,
  addSkip,
  adoptRecord,
  advancePhase,
  answerDecision,
  applyChangedFields,
  applyClassification,
  approve,
  asRecord,
  closeDebate,
  createWork,
  debateState,
  type GuardContext,
  guardFor,
  hasAcceptanceSection,
  loadWork,
  missingAnalysisSections,
  missingConclaveSections,
  nextPhaseOf,
  openDebate,
  openItems,
  PHASES_BY_ROUTE,
  phasesFor,
  plannedStrategyJudgement,
  raiseKind,
  raiseRoute,
  removeCriterion,
  saveWork,
  supersedeCriterion,
  validatorPreconditions,
} from "../src/work.ts";
import { git, makeRepo, repoPaths, tempDir, testEnv } from "./helpers.ts";
import { RESEARCH, STRATEGY } from "./strategy.test.ts";

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
  strategyText: null,
  researcherText: null,
  analysisText: null,
  originRecorded: false,
  knownRootCauses: [],
  gitRepository: false,
  conclaveText: null,
  ledger: null,
  planExists: false,
  evidence: null,
  proven: false,
  unproven: [],
  policy: DEFAULT_POLICY,
};
/** A gap round's read, as crew pack files checklists records it (SP9 Task 13, finding 194): the rows that reach Plan on a non-fast route carry one. */
const READ = {
  kind: "endpoint",
  paths: ["/plugin/skills/crew/checklists/endpoint.md"],
  at: "2026-10-29T00:00:00.000Z",
};
/** The line Plan and the validator name until the read is recorded. */
const MISSING_READ =
  "a checklist read for the gap round (crew pack files checklists <kind>: the core's checklist of that kind and the packs'; crew pack files checklists none --reason \"<why>\" when no kind applies)";

test("SP2b: the debate opens once with a reason, closes with its cost, and holds the plan while open", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "feature");
  applyClassification(work, "feature", { route: "standard", reasons: [], riskAreas: [] });
  work.phase = "conclave";
  work.checklists = [READ];
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
  expect(PHASES_BY_ROUTE.fast).toEqual([
    "receive",
    "recognize",
    "build",
    "gate",
    "deliver",
    "learn",
  ]);
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
    "learn",
  ]);
  expect(PHASES_BY_ROUTE.full).toEqual(PHASES_BY_ROUTE.standard);
});

test("SP2a, SP9-T13 AC-17: plan needs conclave.md with content under the four headings ('none' is content) and a checklist read, the two named at once; a read alone still asks for the sections, none with its reason is a read, and the fast route needs neither", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "feature");
  applyClassification(work, "feature", { route: "standard", reasons: [], riskAreas: [] });
  work.phase = "conclave";
  expect(guardFor(work, "plan", empty)).toEqual([
    "conclave.md in the work folder (the gap round: four sections)",
    MISSING_READ,
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
    MISSING_READ,
  ]);
  const full =
    "# Gap round\n\n## Assumed by good practice\n- auth\n\n## Decisions only the user can make\n- D-1 which roles\n\n## Proposals\nnone\n\n## Warnings\nnone\n";
  expect(missingConclaveSections(full)).toEqual([]);
  expect(guardFor(work, "plan", { ...empty, conclaveText: full })).toEqual([MISSING_READ]);
  // A read alone: the sections are still asked for (nothing loosens); with both, the way is open.
  work.checklists = [READ];
  expect(guardFor(work, "plan", empty)).toEqual([
    "conclave.md in the work folder (the gap round: four sections)",
  ]);
  expect(guardFor(work, "plan", { ...empty, conclaveText: full })).toEqual([]);
  // none with its reason is a record too.
  work.checklists = [{ kind: "none", paths: [], reason: "a refactor of the parser", at: READ.at }];
  expect(guardFor(work, "plan", { ...empty, conclaveText: full })).toEqual([]);
  work.checklists = undefined;
  work.route = "fast";
  expect(guardFor(work, "plan", empty)).toEqual([]);
});

test("SP2a: decisions are numbered once, answered by the user or by the validator's default, and guard plan", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "feature");
  applyClassification(work, "feature", { route: "standard", reasons: [], riskAreas: [] });
  work.phase = "conclave";
  work.checklists = [READ];
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
  expect(answerDecision(work, "D-1", "everyone", validator, DEFAULT_POLICY)).toEqual({
    refused: "the validator may only take the stated default of D-1 (admins only)",
  });
  expect(answerDecision(work, "D-2", undefined, validator, DEFAULT_POLICY)).toEqual({
    refused: "D-2 has no stated default; a person answers it",
  });
  expect(answerDecision(work, "D-1", undefined, validator, DEFAULT_POLICY)).toMatchObject({
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
  expect(answerDecision(work, "D-2", "yes, 410", { by: "user" }, DEFAULT_POLICY)).toMatchObject({
    answer: "yes, 410",
    by: "user",
  });
  expect(guardFor(work, "plan", counting)).toEqual([]);
  expect(answerDecision(work, "D-9", "x", { by: "user" }, DEFAULT_POLICY)).toEqual({
    refused: "unknown decision: D-9",
  });
});

test("SP2a: plan needs every blocking objection bound or waived; a bound criterion cannot be removed", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "feature");
  applyClassification(work, "feature", { route: "standard", reasons: [], riskAreas: [] });
  work.phase = "conclave";
  work.checklists = [READ];
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
  work.checklists = [READ];
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
  answerDecision(work, "D-1", "admins", { by: "user" }, DEFAULT_POLICY);
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
  work.checklists = [READ];
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
      "validation of spec by lead-security: returned 1 return (conclave/lead-security.md); revise the spec and record the lead again (a resumed lead's answer: its -reply.md file)",
    ]);
  const security = work.validations[1];
  if (security) work.validations[1] = { ...security, verdict: "validated", returns: 0 };
  expect(advancePhase(work, ctx)).toEqual({ ok: true, phase: "plan" });
  expect(typeof work.phaseAt?.plan).toBe("string");
  // The spec changed after the validations: stale, asked again.
  work.phase = "conclave";
  work.checklists = [READ];
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
      "validation of delivery by lead-security: returned 2 returns (conclave/lead-security.delivery.md); revise the delivery and record the lead again (a resumed lead's answer: its -reply.md file)",
    ]);
  // A fast item, and a standard item with no seats recorded, ask for no validation.
  const fast = createWork(paths, "Fast");
  addCriterion(fast, "a");
  fast.phase = "recognize";
  expect(advancePhase(fast, empty).ok).toBe(true);
  const unseated = createWork(paths, "Old standard item");
  unseated.route = "standard";
  unseated.phase = "conclave";
  unseated.checklists = [READ];
  addCriterion(unseated, "a");
  expect(advancePhase(unseated, ctx)).toEqual({ ok: true, phase: "plan" });
});

test("SP2a review: the validator never overwrites an answer; a person may change theirs", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "feature");
  addDecision(work, "Which roles?", "admins only");
  expect(answerDecision(work, "D-1", "everyone", { by: "user" }, DEFAULT_POLICY)).toMatchObject({
    answer: "everyone",
  });
  expect(
    answerDecision(
      work,
      "D-1",
      undefined,
      {
        by: "validator",
        mode: "dontAsk",
        rule: "stated-default",
      },
      DEFAULT_POLICY,
    ),
  ).toEqual({
    refused: "D-1 is already answered by the user; the validator never overwrites an answer",
  });
  expect(work.decisions?.[0]).toMatchObject({ answer: "everyone", by: "user" });
  expect(answerDecision(work, "D-1", "admins only", { by: "user" }, DEFAULT_POLICY)).toMatchObject({
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

test("SP3-T2 AC-2: phasesFor inserts analyse after recognize for an issue on every route, a feature and a record without a kind keep the route's list, new-project is never fast, and a reclassification never removes issue or new-project", () => {
  expect(phasesFor({ route: "fast", kind: "issue" })).toEqual([
    "receive",
    "recognize",
    "analyse",
    "build",
    "gate",
    "deliver",
    "learn",
  ]);
  expect(phasesFor({ route: "standard", kind: "issue" })).toEqual([
    "receive",
    "recognize",
    "analyse",
    "understand",
    "specify",
    "conclave",
    "plan",
    "build",
    "gate",
    "deliver",
    "learn",
  ]);
  expect(phasesFor({ route: "full", kind: "issue" })).toEqual(
    phasesFor({ route: "standard", kind: "issue" }),
  );
  expect(phasesFor({ route: "fast", kind: "feature" })).toEqual(PHASES_BY_ROUTE.fast);
  expect(phasesFor({ route: "standard" })).toEqual(PHASES_BY_ROUTE.standard);
  expect(PHASE_ORDER.indexOf("analyse")).toBe(PHASE_ORDER.indexOf("recognize") + 1);
  const paths = repoPaths(makeRepo(), testEnv());
  const shop = createWork(paths, "a new shop");
  applyClassification(
    shop,
    "chore",
    { route: "fast", reasons: ["r"], riskAreas: [] },
    { kind: "new-project", from: "answer" },
  );
  expect(shop).toMatchObject({ kind: "new-project", kindFrom: "answer", route: "standard" });
  expect(shop.routeReasons).toContain("kind new-project is never fast");
  const issue = createWork(paths, "a bug");
  applyClassification(
    issue,
    "fix",
    { route: "fast", reasons: ["r"], riskAreas: [] },
    { kind: "issue", from: "work_type fix" },
  );
  applyClassification(
    issue,
    "feature",
    { route: "standard", reasons: ["r2"], riskAreas: [] },
    { kind: "feature", from: "work_type feature" },
  );
  expect(issue.kind).toBe("issue");
  expect(issue.routeReasons).toContain("kept kind issue: a kind is never lowered");
});

test("SP3-T2 AC-2, AC-3: the guard out of analyse needs the three sections and, in git, origin.json; an issue enters build only with a behavior and a preserve criterion", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "a bug");
  applyClassification(
    work,
    "fix",
    { route: "fast", reasons: ["r"], riskAreas: [] },
    { kind: "issue", from: "work_type fix" },
  );
  expect(nextPhaseOf(work)).toBe("analyse");
  work.phase = "analyse";
  const inGit: GuardContext = { ...empty, gitRepository: true };
  expect(guardFor(work, "build", inGit)).toEqual([
    'an "Origin" section with content in analysis.md (write "none" when there is nothing)',
    'a "Cause" section with content in analysis.md (write "none" when there is nothing)',
    'a "Blast radius" section with content in analysis.md (write "none" when there is nothing)',
    "analysis/origin.json in the work folder (crew analyse <id> --paths <files>)",
    'at least one acceptance criterion (crew criteria <id> add "...")',
    'an issue needs a regression test: at least one behavior criterion (crew criteria <id> add "<text>")',
    'an issue keeps what works: at least one preserve criterion (crew criteria <id> add "<text>" --kind preserve)',
  ]);
  const analysis =
    "# Analysis\n\n## Origin\nitem 001\n\n## Cause\nnone\n\n## Blast radius\none module\n";
  addCriterion(work, "the regression test");
  const written: GuardContext = { ...inGit, analysisText: analysis, originRecorded: true };
  expect(guardFor(work, "build", written)).toEqual([
    'an issue keeps what works: at least one preserve criterion (crew criteria <id> add "<text>" --kind preserve)',
  ]);
  addCriterion(work, "keep", "preserve");
  expect(guardFor(work, "build", written)).toEqual([]);
  expect(
    guardFor(work, "build", { ...written, gitRepository: false, originRecorded: false }),
  ).toEqual([]);
  expect(advancePhase(work, written)).toEqual({ ok: true, phase: "build" });
  const feature = createWork(paths, "a feature");
  applyClassification(
    feature,
    "chore",
    { route: "fast", reasons: ["r"], riskAreas: [] },
    { kind: "feature", from: "work_type chore" },
  );
  addCriterion(feature, "x");
  expect(nextPhaseOf(feature)).toBe("build");
  expect(guardFor(feature, "build", empty)).toEqual([]);
  expect(missingAnalysisSections("## Origin\nx\n## Cause\n")).toEqual(["Cause", "Blast radius"]);
  expect(
    missingAnalysisSections("## Origin\nnone\n## Cause\nnone\n## Blast radius\nnone\n"),
  ).toEqual([]);
});

test("SP3-T3 AC-1: createWork writes the Source section with the original text verbatim: the document's text, or the request's for a ticket", () => {
  const root = makeRepo({
    "docs/requests/newsletter.md": "# Newsletter\n\nAdd a newsletter flag.\n",
  });
  const paths = repoPaths(root, testEnv());
  const doc = createWork(paths, "the request is in docs/requests/newsletter.md", undefined, {
    channel: "document",
    documentPath: "docs/requests/newsletter.md",
  });
  expect(readFileSync(join(root, ".crew", "work", doc.id, "brief.md"), "utf8")).toBe(
    "# Brief\n\n## Request\n\nthe request is in docs/requests/newsletter.md\n\n## Source\n\ndocument docs/requests/newsletter.md\n\n# Newsletter\n\nAdd a newsletter flag.\n",
  );
  expect(doc.source).toEqual({ channel: "document", documentPath: "docs/requests/newsletter.md" });
  const ticket = createWork(paths, "Change the button label to Sign up", undefined, {
    channel: "task-manager",
    connector: "clickup",
    externalId: "86c1",
    url: "https://x.invalid/t/86c1",
    proposedPriority: "high",
  });
  expect(readFileSync(join(root, ".crew", "work", ticket.id, "brief.md"), "utf8")).toBe(
    "# Brief\n\n## Request\n\nChange the button label to Sign up\n\n## Source\n\nclickup 86c1 (https://x.invalid/t/86c1), proposed priority high\n\nChange the button label to Sign up\n",
  );
  const plain = createWork(paths, "a plain request");
  expect(readFileSync(join(root, ".crew", "work", plain.id, "brief.md"), "utf8")).toBe(
    "# Brief\n\n## Request\n\na plain request\n",
  );
  expect(plain.source).toBeUndefined();
});

test("SP8-T1 AC-5 (finding 83): the guard out of analyse asks for the analysis document and the origin whatever the next phase: understand on the standard route, build on the fast one", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const issue = { kind: "issue" as const, from: "work_type fix" };
  const standard = createWork(paths, "fix");
  applyClassification(standard, "fix", { route: "standard", reasons: [], riskAreas: [] }, issue);
  standard.phase = "analyse";
  const ctx = { ...empty, gitRepository: true, originRecorded: false };
  const asked = [
    'an "Origin" section with content in analysis.md (write "none" when there is nothing)',
    'a "Cause" section with content in analysis.md (write "none" when there is nothing)',
    'a "Blast radius" section with content in analysis.md (write "none" when there is nothing)',
    "analysis/origin.json in the work folder (crew analyse <id> --paths <files>)",
  ];
  expect(guardFor(standard, "understand", ctx)).toEqual(asked);
  const fast = createWork(paths, "fix");
  applyClassification(fast, "fix", { route: "fast", reasons: [], riskAreas: [] }, issue);
  addCriterion(fast, "x");
  fast.phase = "analyse";
  expect(guardFor(fast, "build", ctx)).toEqual(expect.arrayContaining(asked));
});

test("SP8-T2 AC-1: an audit is always full with the four phases on every route, its guard into deliver names the audit's records alone, and the two new phases sit in the order", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "audit this project");
  applyClassification(
    work,
    "audit",
    { route: "fast", reasons: [], riskAreas: [] },
    { kind: "audit", from: "work_type audit" },
  );
  expect(work.route).toBe("full");
  expect(work.routeReasons).toContain("kind audit is always full");
  expect(phasesFor(work)).toEqual(["receive", "recognize", "audit", "deliver"]);
  expect(phasesFor({ route: "standard", kind: "audit" })).toEqual([
    "receive",
    "recognize",
    "audit",
    "deliver",
  ]);
  expect(PHASE_ORDER.indexOf("audit")).toBeGreaterThan(PHASE_ORDER.indexOf("recognize"));
  expect(PHASE_ORDER.indexOf("audit")).toBeLessThan(PHASE_ORDER.indexOf("understand"));
  expect(PHASE_ORDER.indexOf("strategy")).toBe(PHASE_ORDER.indexOf("understand") + 1);
  work.phase = "audit";
  const unproven = [
    "audit run not recorded (crew audit <id> run)",
    "audit report not rendered (crew audit <id> report)",
    "the audit's signature (crew approve <id> audit)",
  ];
  expect(guardFor(work, "deliver", { ...empty, proven: false, unproven })).toEqual(
    unproven.map((r) => `not proven: ${r}`),
  );
});

test("SP8-T2 AC-2: a new project's phases carry strategy before specify; raiseKind moves a feature to new-project from understand, specify or conclave (back to strategy from the last two) and refuses the rest", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const feature = () => {
    const w = createWork(paths, "a feature");
    applyClassification(
      w,
      "feature",
      { route: "standard", reasons: [], riskAreas: [] },
      { kind: "feature", from: "work_type feature" },
    );
    return w;
  };
  const w = feature();
  w.phase = "conclave";
  expect(raiseKind(w, "a new domain")).toEqual({ ok: true, movedTo: "strategy" });
  expect(w).toMatchObject({
    kind: "new-project",
    kindFrom: "raised: a new domain",
    phase: "strategy",
  });
  expect(w.routeReasons).toContain("kind raised to new-project: a new domain");
  expect(phasesFor(w)).toEqual([
    "receive",
    "recognize",
    "understand",
    "strategy",
    "specify",
    "conclave",
    "plan",
    "build",
    "gate",
    "deliver",
    "learn",
  ]);
  // The research comes first, then the document; its shape and its ruling are the strategy guard's (SP8 Task 3).
  expect(guardFor(w, "specify", { ...empty, strategyText: null })).toEqual([
    "conclave/researcher.md: the researcher's pass comes before the strategy (references/strategy.md)",
  ]);
  expect(
    guardFor(w, "specify", { ...empty, researcherText: RESEARCH, strategyText: null }),
  ).toEqual(["strategy.md in the work folder"]);
  expect(raiseKind(w, "again")).toEqual({
    ok: false,
    reason:
      "only a feature is raised to a strategy: this item is kind new-project (from raised: a new domain)",
  });
  const early = feature();
  early.phase = "understand";
  expect(raiseKind(early, "x")).toEqual({ ok: true, movedTo: null });
  expect(early.phase).toBe("understand");
  const mid = feature();
  mid.phase = "specify";
  expect(raiseKind(mid, "x")).toEqual({ ok: true, movedTo: "strategy" });
  expect(String(mid.phase)).toBe("strategy");
  const late = feature();
  late.phase = "plan";
  expect(raiseKind(late, "x")).toEqual({
    ok: false,
    reason: "a strategy comes before the plan; from plan on, a new item",
  });
  const issue = createWork(paths, "a fix");
  applyClassification(
    issue,
    "fix",
    { route: "standard", reasons: [], riskAreas: [] },
    { kind: "issue", from: "work_type fix" },
  );
  issue.phase = "understand";
  expect(raiseKind(issue, "x")).toMatchObject({ ok: false });
  const audit = createWork(paths, "an audit");
  applyClassification(
    audit,
    "audit",
    { route: "full", reasons: [], riskAreas: [] },
    { kind: "audit", from: "work_type audit" },
  );
  audit.phase = "audit";
  expect(raiseKind(audit, "x")).toMatchObject({ ok: false });
  expect(audit.kind).toBe("audit");
});

test("SP8-T3 AC-2, AC-3: the guard out of strategy asks for the research, then the faults, then a proven strategy ruling on the current hash (stale after an edit, never a code ruling); the strategy gate is planned for a new project alone", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "a new product");
  applyClassification(
    work,
    "new-product",
    { route: "standard", reasons: [], riskAreas: [] },
    { kind: "new-project", from: "work_type new-product" },
  );
  work.phase = "strategy";
  expect(guardFor(work, "specify", { ...empty, strategyText: STRATEGY })).toEqual([
    "conclave/researcher.md: the researcher's pass comes before the strategy (references/strategy.md)",
  ]);
  expect(guardFor(work, "specify", { ...empty, researcherText: RESEARCH })).toEqual([
    "strategy.md in the work folder",
  ]);
  const broken = STRATEGY.replace(
    "- One service serves the need [R3]",
    "- One service serves the need",
  );
  expect(
    guardFor(work, "specify", { ...empty, strategyText: broken, researcherText: RESEARCH })[0],
  ).toBe(
    'strategy.md: no mark on "One service serves the need" in Viability: every claim ends with [R<n>] naming a fact line of conclave/researcher.md',
  );
  const hash = strategyHash(STRATEGY, RESEARCH);
  const ruling = (
    gate: "strategy" | "code-quality",
    fingerprint: string,
    verdict: "proven" | "not-proven" = "proven",
  ) => ({
    ...emptyEvidence(),
    judgement: [
      {
        gate,
        verdict,
        reviewer: "judge",
        judge: "judge",
        findings: [],
        at: "2026-10-19T10:00:00.000Z",
        fingerprint,
      },
    ],
  });
  const ctx = (evidence: Evidence | null) => ({
    ...empty,
    strategyText: STRATEGY,
    researcherText: RESEARCH,
    evidence,
  });
  expect(guardFor(work, "specify", ctx(null))).toEqual([
    "a proven strategy ruling (crew strategy <id> check, the reviewer and the judge, crew judgement <id> record --ruling <file>)",
  ]);
  expect(guardFor(work, "specify", ctx(ruling("code-quality", hash)))).toEqual([
    "a proven strategy ruling (crew strategy <id> check, the reviewer and the judge, crew judgement <id> record --ruling <file>)",
  ]);
  expect(guardFor(work, "specify", ctx(ruling("strategy", "other")))).toEqual([
    "the strategy ruling is stale: strategy.md or conclave/researcher.md changed after it; check and judge again",
  ]);
  expect(guardFor(work, "specify", ctx(ruling("strategy", hash, "not-proven")))).toEqual([
    "the strategy ruling is not proven (0 findings)",
  ]);
  expect(guardFor(work, "specify", ctx(ruling("strategy", hash)))).toEqual([]);
  // The planned gate names its reviewer: the live path (the check, the record, the status) reads it from here.
  expect(plannedStrategyJudgement(work)).toEqual([
    {
      gate: "strategy",
      reviewer: "judge",
      reason: "new project, standard route: the judge rules from the files",
    },
  ]);
  work.route = "full";
  expect(plannedStrategyJudgement(work)).toEqual([
    {
      gate: "strategy",
      reviewer: "cto",
      reason: "new project, full route: the CTO reviews, the judge rules",
    },
  ]);
  const feature = createWork(paths, "a feature");
  applyClassification(
    feature,
    "feature",
    { route: "full", reasons: [], riskAreas: [] },
    { kind: "feature", from: "work_type feature" },
  );
  expect(plannedStrategyJudgement(feature)).toEqual([]);
});

test("SP4-T4 AC-1: learn follows deliver on every route and kind but the audit, is entered on a proof that holds now, and is the last phase", () => {
  for (const route of ["fast", "standard", "full"] as const) {
    expect(phasesFor({ route, kind: "feature" }).slice(-2)).toEqual(["deliver", "learn"]);
    expect(phasesFor({ route, kind: "issue" }).slice(-2)).toEqual(["deliver", "learn"]);
  }
  expect(phasesFor({ route: "standard", kind: "new-project" }).slice(-2)).toEqual([
    "deliver",
    "learn",
  ]);
  expect(phasesFor({ route: "full", kind: "audit" })).toEqual([
    "receive",
    "recognize",
    "audit",
    "deliver",
  ]);
  expect(PHASE_ORDER.at(-1)).toBe("learn");
  const paths = repoPaths(makeRepo({ "src/a.ts": "x" }));
  const work = createWork(paths, "x");
  work.route = "fast";
  work.phase = "deliver";
  // The proof as the engine computes it now is the ticket (the security lead's R-3).
  const stale = advancePhase(work, {
    ...empty,
    proven: false,
    unproven: ["watched files changed"],
  });
  expect(stale).toEqual({
    ok: false,
    missing: [`not proven: the proof is on earlier code (crew gate run ${work.id})`],
  });
  expect(work.phase).toBe("deliver");
  expect(advancePhase(work, { ...empty, proven: true, unproven: [] })).toEqual({
    ok: true,
    phase: "learn",
  });
  expect(nextPhaseOf(work)).toBeNull();
  expect(advancePhase(work, { ...empty, proven: true, unproven: [] })).toEqual({
    ok: false,
    missing: ["already at the last phase"],
  });
  saveWork(paths, work);
  expect(openItems(paths).map((w) => w.id)).toEqual([]);
});

test("SP4-T5 AC-2: the guard out of analyse names a known root cause neither cited in analysis.md nor contradicted by this item, with its paths and the two ways out, and passes with the citation or the contradiction", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "a bug");
  applyClassification(
    work,
    "fix",
    { route: "fast", reasons: ["r"], riskAreas: [] },
    { kind: "issue", from: "work_type fix" },
  );
  work.phase = "analyse";
  addCriterion(work, "the regression test");
  addCriterion(work, "keep", "preserve");
  const analysis =
    "# Analysis\n\n## Origin\nitem 001\n\n## Cause\nnone\n\n## Blast radius\none module\n";
  const known = {
    id: "K-4",
    title: "Totals summed before the discount",
    paths: ["src/accounts.mjs", "src/totals.mjs"],
    contradicted: false,
  };
  const ctx: GuardContext = {
    ...empty,
    gitRepository: true,
    originRecorded: true,
    analysisText: analysis,
    knownRootCauses: [known],
  };
  const refusal = `K-4 is a known root cause of src/accounts.mjs, src/totals.mjs ("Totals summed before the discount"): cite it in analysis.md as [K:K-4] with what this fix does differently, or crew knowledge contradict K-4 --reason "<why>" --item ${work.id}`;
  expect(guardFor(work, "build", ctx)).toEqual([refusal]);
  // Cited: the mark anywhere in the document.
  expect(
    guardFor(work, "build", {
      ...ctx,
      analysisText: `${analysis}\nUnlike [K:K-4], this fix moves the discount.\n`,
    }),
  ).toEqual([]);
  // Another entry's mark is not this one's.
  expect(guardFor(work, "build", { ...ctx, analysisText: `${analysis}\n[K:K-5]\n` })).toEqual([
    refusal,
  ]);
  // Contradicted by this item: the context says so.
  expect(
    guardFor(work, "build", { ...ctx, knownRootCauses: [{ ...known, contradicted: true }] }),
  ).toEqual([]);
  // Two known causes, one cited: the other alone is named.
  const other = { id: "K-9", title: "Rounding", paths: ["src/totals.mjs"], contradicted: false };
  expect(
    guardFor(work, "build", {
      ...ctx,
      analysisText: `${analysis}[K:K-4]`,
      knownRootCauses: [known, other],
    }),
  ).toEqual([
    `K-9 is a known root cause of src/totals.mjs ("Rounding"): cite it in analysis.md as [K:K-9] with what this fix does differently, or crew knowledge contradict K-9 --reason "<why>" --item ${work.id}`,
  ]);
  // No known cause: nothing asked beyond the document and the origin.
  expect(guardFor(work, "build", { ...ctx, knownRootCauses: [] })).toEqual([]);
});

test("F135: the gate guard reads a superseded criterion through its replacement, and refuses while the replacement has no complete record", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "fix");
  applyClassification(work, "fix", { route: "fast", reasons: [], riskAreas: [] });
  addCriterion(work, "the old text");
  addCriterion(work, "the new text");
  expect(supersedeCriterion(work, "AC-1", "AC-2")).toMatchObject({ criterion: { id: "AC-1" } });
  const evidence = (records: Evidence["tdd"]): GuardContext => ({
    ...empty,
    evidence: { ...emptyEvidence(), tdd: records },
  });
  expect(guardFor(work, "gate", evidence([]))).toEqual([
    "test-first record for AC-2 (crew tdd red/green)",
  ]);
  expect(guardFor(work, "gate", evidence([{ criterion: "AC-2", red: run }]))).toEqual([
    "test-first record for AC-2 (crew tdd red/green)",
  ]);
  expect(guardFor(work, "gate", evidence([{ criterion: "AC-2", red: run, green: run }]))).toEqual(
    [],
  );
});

// 2026-10-28-001 AC-5: one cast for the two merges of a work item (the advisory of 2026-10-27-008's round 4).
test("2026-10-28-001 AC-5: asRecord is the work item itself read key by key, and the two merges still write, delete and adopt through it", () => {
  const work = { id: "w", phase: "build", seats: [] } as unknown as WorkItem;
  const record = asRecord(work);
  expect(record).toBe(work as unknown as Record<string, unknown>);
  const loaded = { id: "w", phase: "build", awaiting: "user" } as unknown as WorkItem;
  const inHand = { id: "w", phase: "build", route: "standard" } as unknown as WorkItem;
  const fresh = { id: "w", phase: "build", awaiting: "user", criteria: [1] } as unknown as WorkItem;
  applyChangedFields(fresh, inHand, loaded);
  expect(asRecord(fresh)).toEqual({ id: "w", phase: "build", route: "standard", criteria: [1] });
  adoptRecord(inHand, fresh);
  expect(asRecord(inHand)).toEqual(asRecord(fresh));
});

test("2026-10-28-004 round 2 (code-quality): answerDecision refuses the validator a default Jev disputed, after its own refusals and changing nothing, and a person's answer is taken", () => {
  const work = createWork(repoPaths(makeRepo(), testEnv()), "feature");
  const validator = {
    by: "validator" as const,
    mode: "dontAsk" as const,
    rule: "stated-default" as const,
  };
  const d1 = addDecision(work, "Erase or deactivate?", "deactivate");
  d1.jev = { conservative: 0.1, usersCall: 0.8, model: "file" };
  const before = JSON.stringify(work);
  expect(answerDecision(work, "D-1", undefined, validator, DEFAULT_POLICY)).toEqual({
    refused:
      "disputed by jev: the default of D-1 is not the conservative answer (conservative 0.10); a person decides",
    disputed: true,
  });
  expect(JSON.stringify(work)).toBe(before);
  // Another answer than the default is refused as before the marks, without the dispute.
  expect(answerDecision(work, "D-1", "erase", validator, DEFAULT_POLICY)).toEqual({
    refused: "the validator may only take the stated default of D-1 (deactivate)",
  });
  // A person answers; the validator then gets the standing refusal, not the dispute.
  expect(answerDecision(work, "D-1", "erase", { by: "user" }, DEFAULT_POLICY)).toMatchObject({
    answer: "erase",
    by: "user",
  });
  expect(answerDecision(work, "D-1", undefined, validator, DEFAULT_POLICY)).toEqual({
    refused: "D-1 is already answered by the user; the validator never overwrites an answer",
  });
  // A default marked conservative is taken as before.
  const d2 = addDecision(work, "Keep the index?", "yes");
  d2.jev = { conservative: 0.9, usersCall: 0.2, model: "file" };
  expect(answerDecision(work, "D-2", undefined, validator, DEFAULT_POLICY)).toMatchObject({
    answer: "yes",
    by: "validator",
  });
});
