import { expect, test } from "bun:test";
import {
  computeVerdict,
  emptyEvidence,
  loadEvidence,
  renderReport,
  saveEvidence,
} from "../src/evidence.ts";
import { addObjection, bindObjection, waiveObjection } from "../src/objections.ts";
import { DEFAULT_POLICY } from "../src/policy.ts";
import type {
  Evidence,
  GateRun,
  JudgementRecord,
  ObjectionLedger,
  RunRecord,
  WorkItem,
} from "../src/types.ts";
import {
  addCriterion,
  addDecision,
  addSkip,
  answerDecision,
  approve,
  closeDebate,
  createWork,
  isSkipped,
  openDebate,
  unansweredDecisions,
} from "../src/work.ts";
import { makeRepo, repoPaths, testEnv } from "./helpers.ts";

const run: RunRecord = {
  command: "npm run test",
  exit: 0,
  at: "t",
  durationMs: 5,
  log: "logs/x",
  tail: "",
  timedOut: false,
};
function gate(
  gate: GateRun["gate"],
  status: GateRun["status"],
  extra: Partial<GateRun> = {},
): GateRun {
  return {
    gate,
    target: ".",
    command: "cmd",
    commandSource: "detected",
    confirmed: true,
    exit: status === "pass" ? 0 : 1,
    status,
    durationMs: 1,
    at: "t",
    log: null,
    tail: "",
    fingerprint: "f",
    ...extra,
  };
}
function workWith(paths: ReturnType<typeof repoPaths>): WorkItem {
  const work = createWork(paths, "fix");
  addCriterion(work, "x");
  return work;
}

test("SP2b: the gap round section says whether the debate opened, why, and whether it closed", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = workWith(paths);
  const evidence: Evidence = { ...emptyEvidence(), fingerprint: "f" };
  expect(renderReport(work, evidence, DEFAULT_POLICY)).not.toContain("## Gap round");
  addDecision(work, "Erasure or deactivation?", "deactivation");
  expect(renderReport(work, evidence, DEFAULT_POLICY)).toContain("- Debate: none");
  openDebate(work, "erasure or deactivation changes what is deleted");
  expect(renderReport(work, evidence, DEFAULT_POLICY)).toContain(
    "- Debate: opened (erasure or deactivation changes what is deleted), open",
  );
  closeDebate(work, 5400);
  const report = renderReport(work, evidence, DEFAULT_POLICY);
  expect(report).toContain(
    "- Debate: opened (erasure or deactivation changes what is deleted), closed, 5400 tokens",
  );
  expect(report.indexOf("- D-1:")).toBeLessThan(report.indexOf("- Debate:"));
  // A debate with no decision recorded still shows the section.
  const other = workWith(paths);
  openDebate(other, "the user asked for it");
  expect(renderReport(other, evidence, DEFAULT_POLICY)).toContain("## Gap round");
});
const ruling = (
  gate: JudgementRecord["gate"],
  verdict: JudgementRecord["verdict"],
  extra: Partial<JudgementRecord> = {},
): JudgementRecord => ({ gate, verdict, findings: [], at: "t", fingerprint: "f", ...extra });

test("SP2b: a planned judgement gate is named until a current ruling proves it, and the report shows the rulings and their findings", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = workWith(paths);
  const expectedJudgement = [
    { gate: "code-quality" as const, reason: "standard route" },
    { gate: "test-quality" as const, reason: "standard route" },
    { gate: "security" as const, reason: "risk area auth" },
    { gate: "ui-ux" as const, reason: "interface files: a.vue" },
  ];
  const base: Evidence = {
    ...emptyEvidence(),
    fingerprint: "f",
    tdd: [{ criterion: "AC-1", red: run, green: run }],
    runs: [gate("test", "pass")],
  };
  const input = {
    work,
    evidence: base,
    expected: [{ gate: "test" as const, target: "." }],
    expectedJudgement,
    currentFingerprint: "f",
    tampered: false,
    policy: DEFAULT_POLICY,
  };
  expect(computeVerdict(input).unproven).toEqual([
    "judgement gate code-quality not run",
    "judgement gate test-quality not run",
    "judgement gate security not run",
    "judgement gate ui-ux not run",
  ]);
  const defect = {
    file: "src/a.ts",
    line: 12,
    text: "two reasons to change",
    severity: "defect" as const,
  };
  const judged: Evidence = {
    ...base,
    judgement: [
      ruling("code-quality", "proven", { reviewer: "code-quality", judge: "judge", tokens: 1200 }),
      ruling("test-quality", "not-proven", {
        findings: [defect, { ...defect, file: "src/b.ts", severity: "advisory", outside: true }],
      }),
      ruling("security", "proven", { fingerprint: "old" }),
      ruling("ui-ux", "not-run", { reason: "no browser" }),
    ],
  };
  expect(computeVerdict({ ...input, evidence: judged }).unproven).toEqual([
    "judgement gate test-quality not proven (2 findings)",
    "judgement gate security not run on the current code",
    "judgement gate ui-ux not run: no browser",
  ]);
  // Code changed since the last gate run: that one reason stands for every ruling on older code.
  expect(computeVerdict({ ...input, evidence: judged, currentFingerprint: "g" }).unproven).toEqual([
    "code changed since the last gate run",
    "judgement gate test-quality not proven (2 findings)",
    "judgement gate ui-ux not run: no browser",
  ]);
  // A person's skip takes a gate out; a current proven ruling on the rest proves the item.
  addSkip(work, "gate:ui-ux", "no browser in this session");
  const fixed: Evidence = {
    ...judged,
    judgement: [
      ruling("code-quality", "proven"),
      ruling("test-quality", "proven", { findings: [{ ...defect, severity: "advisory" }] }),
      ruling("security", "proven"),
      ruling("ui-ux", "not-run", { reason: "no browser" }),
    ],
  };
  expect(computeVerdict({ ...input, evidence: fixed })).toEqual({
    verdict: "proven",
    unproven: [],
  });

  const report = renderReport(
    work,
    { ...judged, verdict: "unproven", unproven: [] },
    DEFAULT_POLICY,
  );
  expect(report).toContain("## Judgement gates");
  expect(report).toContain("| Gate | Verdict | Reviewer | Findings | Tokens |");
  expect(report).toContain("| code-quality | proven | code-quality | 0 | 1200 |");
  expect(report).toContain("| test-quality | not proven |  | 2 |  |");
  // A ruling on other code than the evidence's never reads as a proof of this code (review of SP2b, finding 7).
  expect(report).toContain("| security | proven (earlier code) |  | 0 |  |");
  expect(report).toContain("| ui-ux | not run: no browser |  | 0 |  |");
  expect(report).toContain("- test-quality: src/a.ts:12 two reasons to change (defect)");
  expect(report).toContain(
    "- test-quality: src/b.ts:12 two reasons to change (advisory, outside the change)",
  );
  expect(report.indexOf("## Gates")).toBeLessThan(report.indexOf("## Judgement gates"));
  expect(renderReport(work, base, DEFAULT_POLICY)).not.toContain("## Judgement gates");
});

test("evidence loads empty and round-trips", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = workWith(paths);
  expect(loadEvidence(paths, work.id)).toEqual({ evidence: emptyEvidence(), tampered: false });
  const evidence: Evidence = { ...emptyEvidence(), fingerprint: "f" };
  saveEvidence(paths, work.id, evidence);
  expect(loadEvidence(paths, work.id).evidence.fingerprint).toBe("f");
});

test("the verdict names every reason the work is not proven", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = workWith(paths);
  const expected = [
    { gate: "secrets" as const, target: "." },
    { gate: "test" as const, target: "." },
    { gate: "lint" as const, target: "." },
  ];
  const evidence: Evidence = {
    fingerprint: "old",
    tdd: [],
    runs: [
      gate("secrets", "pass"),
      gate("test", "fail"),
      gate("lint", "unavailable", { reason: "no command" }),
    ],
    verdict: "unproven",
    unproven: [],
  };
  expect(
    computeVerdict({
      work,
      evidence,
      expected,
      currentFingerprint: "new",
      tampered: true,
      policy: DEFAULT_POLICY,
    }),
  ).toEqual({
    verdict: "unproven",
    unproven: [
      "state changed outside the engine",
      "code changed since the last gate run",
      "gate test failing",
      "gate lint unavailable: no command",
      "test-first record missing for AC-1",
    ],
  });
});

test("skips, unconfirmed commands and a matching fingerprint", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = workWith(paths);
  addSkip(work, "gate:lint", "legacy code");
  addSkip(work, "tdd:AC-1", "manual");
  const expected = [
    { gate: "test" as const, target: "." },
    { gate: "lint" as const, target: "." },
  ];
  const evidence: Evidence = {
    fingerprint: "f",
    tdd: [],
    runs: [gate("test", "pass", { confirmed: false, commandSource: "proposed" })],
    verdict: "unproven",
    unproven: [],
  };
  expect(
    computeVerdict({
      work,
      evidence,
      expected,
      currentFingerprint: "f",
      tampered: false,
      policy: DEFAULT_POLICY,
    }).unproven,
  ).toEqual(["gate test ran an unconfirmed command (crew profile confirm)"]);
  const confirmed: Evidence = {
    ...evidence,
    runs: [gate("test", "pass")],
    tdd: [{ criterion: "AC-1", red: run, green: run }],
  };
  expect(
    computeVerdict({
      work,
      evidence: confirmed,
      expected,
      currentFingerprint: "f",
      tampered: false,
      policy: DEFAULT_POLICY,
    }),
  ).toEqual({ verdict: "proven", unproven: [] });
});

test("the report says what was proven and what was not", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = workWith(paths);
  addSkip(work, "gate:lint", "legacy code");
  const evidence: Evidence = {
    fingerprint: "f",
    tdd: [{ criterion: "AC-1", red: { ...run, exit: 1 }, green: run }],
    runs: [gate("test", "pass"), gate("deps", "fail")],
    verdict: "unproven",
    unproven: ["gate deps failing"],
  };
  const report = renderReport(work, evidence, DEFAULT_POLICY);
  expect(report).toContain("# Report: fix");
  expect(report).toContain("**Not proven**");
  expect(report).toContain("gate deps failing");
  expect(report).toContain("| AC-1 | behavior | x | red then green |");
  expect(report).toContain("| test | . | pass |");
  expect(report).toContain("gate:lint");
  expect(report).toContain("legacy code");
});

test("a gate skipped by the agent is still expected unless the policy counts unattended decisions", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = workWith(paths);
  addSkip(work, "gate:test", "slow", { by: "agent", mode: "auto" });
  const expected = [{ gate: "test" as const, target: "." }];
  const evidence: Evidence = {
    fingerprint: "f",
    tdd: [{ criterion: "AC-1", red: run, green: run }],
    runs: [],
    verdict: "unproven",
    unproven: [],
  };
  const input = { work, evidence, expected, currentFingerprint: "f", tampered: false };
  expect(computeVerdict({ ...input, policy: DEFAULT_POLICY }).unproven).toEqual([
    "gate test not run",
  ]);
  expect(
    computeVerdict({ ...input, policy: { ...DEFAULT_POLICY, unattendedDecisions: "count" } })
      .verdict,
  ).toBe("proven");
});

test("the report says who took each decision, in which mode, and whether it counted", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = workWith(paths);
  approve(work, "spec");
  approve(work, "spec", { by: "agent", mode: "auto" });
  addSkip(work, "gate:lint", "legacy");
  addSkip(work, "gate:deps", "offline", { by: "agent", mode: "bypassPermissions" });
  const evidence: Evidence = { ...emptyEvidence(), fingerprint: "f" };

  const waiting = renderReport(work, evidence, DEFAULT_POLICY);
  expect(waiting).toContain("## Decisions");
  expect(waiting).not.toContain("Skipped by the user");
  expect(waiting).toContain("- spec approved by the user (");
  expect(waiting).toContain("- spec approved by the agent in auto mode (");
  expect(waiting).toContain("- `gate:lint` skipped by the user: legacy (");
  expect(waiting).toContain(
    "- `gate:deps` skipped by the agent in bypassPermissions mode: offline (",
  );
  expect(waiting.match(/\): not counted, the policy waits for a person/g)).toHaveLength(2);
  expect(waiting).not.toContain("counted by policy");

  const counting = renderReport(work, evidence, {
    ...DEFAULT_POLICY,
    unattendedDecisions: "count",
  });
  expect(counting.match(/\): counted by policy/g)).toHaveLength(2);
  expect(counting).not.toContain("not counted");
});

test("the report says when the item started in a checkout shared with an open item (finding 9)", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = workWith(paths);
  const evidence: Evidence = { ...emptyEvidence(), fingerprint: "f" };
  expect(renderReport(work, evidence, DEFAULT_POLICY)).not.toContain("## Decisions");
  work.sharedCheckout = {
    with: ["2026-10-13-001-lane-a", "2026-10-13-002-lane-b"],
    paths: ["src/a.ts", "src/b.ts"],
    at: "2026-10-14T10:00:00.000Z",
  };
  const report = renderReport(work, evidence, DEFAULT_POLICY);
  expect(report).toContain("## Decisions");
  expect(report).toContain(
    "- started in a checkout shared with 2026-10-13-001-lane-a, 2026-10-13-002-lane-b, open with uncommitted changes in src/a.ts, src/b.ts (2026-10-14T10:00:00.000Z)",
  );
});

test("SP2a: the report lists the gap round's decisions and who took each", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = workWith(paths);
  const evidence: Evidence = { ...emptyEvidence(), fingerprint: "f" };
  addDecision(work, "Erasure or deactivation?", "deactivation");
  addDecision(work, "Delete the provider profile too?");
  answerDecision(work, "D-1", undefined, {
    by: "validator",
    mode: "dontAsk",
    rule: "stated-default",
  });
  answerDecision(work, "D-2", "yes", { by: "user" });
  const report = renderReport(work, evidence, {
    ...DEFAULT_POLICY,
    unattendedDecisions: "validator",
  });
  expect(report).toContain("## Gap round");
  expect(report).toContain(
    "- D-1: Erasure or deactivation? → deactivation, by the validator (rule: stated-default): counted by policy",
  );
  expect(report).toContain("- D-2: Delete the provider profile too? → yes, by the user");
});

test("SP2a: a blocking objection keeps the item unproven until resolved or waived, and the report says so", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = workWith(paths);
  const ledger: ObjectionLedger = { objections: [] };
  const o1 = addObjection(
    ledger,
    "the sync would re-subscribe everyone",
    "fault-finder",
    "blocking",
  );
  const o2 = addObjection(ledger, "erasure, not deactivation?", "gap-round", "blocking");
  const evidence: Evidence = {
    ...emptyEvidence(),
    fingerprint: "f",
    tdd: [{ criterion: "AC-1", red: run, green: run }],
    runs: [gate("secrets", "pass"), gate("test", "pass")],
  };
  const input = {
    work,
    evidence,
    expected: [
      { gate: "secrets" as const, target: "." },
      { gate: "test" as const, target: "." },
    ],
    currentFingerprint: "f",
    tampered: false,
    policy: DEFAULT_POLICY,
  };
  expect(computeVerdict({ ...input, ledger }).unproven).toEqual([
    "blocking objection O-1 open: the sync would re-subscribe everyone",
    "blocking objection O-2 open: erasure, not deactivation?",
  ]);
  bindObjection(ledger, work, o1.id, "AC-1");
  waiveObjection(ledger, o2.id, "soft delete chosen knowingly", { by: "user" });
  expect(computeVerdict({ ...input, ledger }).verdict).toBe("proven");
  const report = renderReport(work, { ...evidence, verdict: "proven" }, DEFAULT_POLICY, ledger);
  expect(report).toContain("- Verdict: **Proven**, with 1 objection waived by the user");
  expect(report).toContain("## Objections");
  expect(report).toContain(
    "- O-1 (blocking, raised by fault-finder) resolved by AC-1: the sync would re-subscribe everyone",
  );
  expect(report).toContain(
    "- O-2 (blocking, raised by gap-round) waived by the user: soft delete chosen knowingly (",
  );
});

test("ADR 0005: a relayed decision reads by the user, relayed by the agent, everywhere, and counts as a person's", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = workWith(paths);
  const relayed = { by: "user" as const, relayed: true };
  approve(work, "spec", relayed);
  addSkip(work, "gate:lint", "legacy", relayed);
  addDecision(work, "Which?");
  answerDecision(work, "D-1", "this", relayed);
  const ledger: ObjectionLedger = { objections: [] };
  const o1 = addObjection(ledger, "re-subscribes everyone", "fault-finder", "blocking");
  waiveObjection(ledger, o1.id, "chosen knowingly", relayed);
  expect(ledger.objections[0]?.waived).toMatchObject({ by: "user", relayed: true });
  const evidence: Evidence = {
    ...emptyEvidence(),
    fingerprint: "f",
    verdict: "proven",
    unproven: [],
  };
  const report = renderReport(work, evidence, DEFAULT_POLICY, ledger);
  expect(report).toContain(
    "- Verdict: **Proven**, with 1 objection waived by the user, relayed by the agent\n",
  );
  expect(report).toContain("- spec approved by the user, relayed by the agent (");
  expect(report).toContain("- `gate:lint` skipped by the user, relayed by the agent: legacy (");
  expect(report).toContain("- D-1: Which? → this, by the user, relayed by the agent");
  expect(report).toContain(
    "- O-1 (blocking, raised by fault-finder) waived by the user, relayed by the agent: chosen knowingly (",
  );
  expect(report).not.toContain("counted");
  // A relayed decision is a person's: it holds under every unattended setting.
  for (const u of ["wait", "count", "validator"] as const) {
    const policy = { ...DEFAULT_POLICY, unattendedDecisions: u };
    expect(isSkipped(work, "gate:lint", policy)).toBe(true);
    expect(unansweredDecisions(work, policy)).toEqual([]);
  }
});

test("SP2a: the report names the validator's approval and whether the policy counted it", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = workWith(paths);
  approve(work, "spec", { by: "validator", mode: "dontAsk", rule: "complete-gap-round" });
  const evidence: Evidence = { ...emptyEvidence(), fingerprint: "f" };
  const waiting = renderReport(work, evidence, DEFAULT_POLICY);
  expect(waiting).toContain("- spec approved by the validator (rule: complete-gap-round) (");
  expect(waiting).toContain("): not counted, the policy waits for a person");
  expect(
    renderReport(work, evidence, { ...DEFAULT_POLICY, unattendedDecisions: "validator" }),
  ).toContain("): counted by policy");
});

test("SP2a review: the verdict line names who waived, and a not-counted waiver reads as open with who recorded it", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = workWith(paths);
  const ledger: ObjectionLedger = { objections: [] };
  const o1 = addObjection(ledger, "re-subscribes everyone", "fault-finder", "blocking");
  waiveObjection(ledger, o1.id, "no time", { by: "agent", mode: "dontAsk" });
  const evidence: Evidence = { ...emptyEvidence(), fingerprint: "f" };
  const waiting = renderReport(work, evidence, DEFAULT_POLICY, ledger);
  expect(waiting).toContain("- Verdict: **Not proven**\n");
  expect(waiting).not.toContain("waived by the user");
  expect(waiting).toContain(
    "- O-1 (blocking, raised by fault-finder) open (waiver by the agent in dontAsk mode not counted): re-subscribes everyone",
  );
  const counting = renderReport(
    work,
    { ...evidence, verdict: "proven" },
    { ...DEFAULT_POLICY, unattendedDecisions: "count" },
    ledger,
  );
  expect(counting).toContain(
    "- Verdict: **Proven**, with 1 objection waived by the agent in dontAsk mode (counted by policy)",
  );
  expect(counting).not.toContain("waived by the user");
});

test("an item with no criteria is never proven, whatever the gates say", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "fix");
  const expected = [{ gate: "test" as const, target: "." }];
  const evidence: Evidence = {
    fingerprint: "f",
    tdd: [],
    runs: [gate("test", "pass")],
    verdict: "unproven",
    unproven: [],
  };
  expect(
    computeVerdict({
      work,
      evidence,
      expected,
      currentFingerprint: "f",
      tampered: false,
      policy: DEFAULT_POLICY,
    }),
  ).toEqual({
    verdict: "unproven",
    unproven: ['no acceptance criteria (crew criteria <id> add "...")'],
  });
});

test("finding 8: a gate expected for a stack is matched and named by that stack", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = workWith(paths);
  addSkip(work, "tdd:AC-1", "manual");
  const expected = [
    { gate: "test" as const, target: ".", stack: "node" as const },
    { gate: "test" as const, target: ".", stack: "php" as const },
    { gate: "lint" as const, target: "apps/api", stack: "php" as const },
  ];
  const evidence: Evidence = {
    fingerprint: "f",
    tdd: [],
    runs: [gate("test", "pass", { stack: "node" }), gate("test", "pass")],
    verdict: "unproven",
    unproven: [],
  };
  const input = { work, evidence, expected, currentFingerprint: "f", tampered: false };
  expect(computeVerdict({ ...input, policy: DEFAULT_POLICY }).unproven).toEqual([
    "gate test (php) not run",
    "gate lint (apps/api, php) not run",
  ]);
  const complete: Evidence = {
    ...evidence,
    runs: [
      gate("test", "pass", { stack: "node" }),
      gate("test", "pass", { stack: "php" }),
      gate("lint", "pass", { target: "apps/api", stack: "php" }),
    ],
  };
  expect(computeVerdict({ ...input, evidence: complete, policy: DEFAULT_POLICY }).verdict).toBe(
    "proven",
  );
});

test("SP2c: the report's Roles section lists each role's end with its tokens and the file the engine saved", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "fix");
  const evidence: Evidence = {
    ...emptyEvidence(),
    roles: [
      {
        agent: "review-code-quality",
        agentId: "a1",
        at: "2026-10-15T11:20:00.000Z",
        tokens: 39912,
        tokensFrom: "transcript",
        file: "review/code-quality.findings.md",
      },
      {
        agent: "judge",
        at: "2026-10-15T11:25:00.000Z",
        tokens: 0,
        tokensFrom: "none",
        file: "review/ruling.json",
      },
      // SP7a: a debate role carries the lens it argued from, shown in its own column.
      {
        agent: "expert-1",
        agentId: "e1",
        at: "2026-10-15T11:10:00.000Z",
        tokens: 5000,
        tokensFrom: "transcript",
        file: "conclave/expert-1.md",
        personality: "creative",
      },
    ],
  };
  const report = renderReport(work, evidence, DEFAULT_POLICY);
  expect(report).toContain(
    "## Roles\n\n| Role | Personality | At | Tokens | Answer |\n| :- | :- | :- | -: | :- |\n",
  );
  expect(report).toContain(
    "| review-code-quality | - | 2026-10-15T11:20:00.000Z | 39912 | review/code-quality.findings.md |",
  );
  expect(report).toContain(
    "| judge | - | 2026-10-15T11:25:00.000Z | not read | review/ruling.json |",
  );
  expect(report).toContain(
    "| expert-1 | creative | 2026-10-15T11:10:00.000Z | 5000 | conclave/expert-1.md |",
  );
});
