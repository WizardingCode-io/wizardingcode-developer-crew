import { expect, test } from "bun:test";
import { emptyEvidence, saveEvidence } from "../src/evidence.ts";
import type { KnowledgeScope } from "../src/knowledge.ts";
import { computeMetrics, knowledgeFigures, metricsText } from "../src/metrics.ts";
import { addObjection, emptyLedger, saveLedger, waiveObjection } from "../src/objections.ts";
import type {
  Evidence,
  GateRun,
  JudgementRecord,
  KnowledgeBase,
  KnowledgeEntry,
  KnowledgeRef,
  Verification,
} from "../src/types.ts";
import { createWork, saveWork } from "../src/work.ts";
import { makeRepo, repoPaths, testEnv } from "./helpers.ts";

const T0 = Date.UTC(2026, 9, 17, 10, 0, 0);
const at = (minutes: number): string => new Date(T0 + minutes * 60_000).toISOString();

const run = (gate: GateRun["gate"], status: GateRun["status"]): GateRun => ({
  gate,
  target: ".",
  command: status === "skipped" ? null : "x",
  commandSource: status === "skipped" ? null : "detected",
  confirmed: true,
  exit: status === "pass" ? 0 : null,
  status,
  durationMs: 1,
  at: at(0),
  log: null,
  tail: "",
  fingerprint: "sha256:f",
  ...(status === "skipped" ? { reason: "policy" } : {}),
});

const ruling = (
  gate: JudgementRecord["gate"],
  verdict: JudgementRecord["verdict"],
  findings: JudgementRecord["findings"],
  reviewer?: string,
): JudgementRecord => ({
  gate,
  verdict,
  ...(reviewer ? { reviewer } : {}),
  findings,
  ...(verdict === "not-run" ? { reason: "no browser" } : {}),
  at: at(0),
  fingerprint: "sha256:f",
});

test("SP7a AC-4 (round 2): computeMetrics counts every figure from the records of the given projects, nothing else", () => {
  const env = testEnv();
  const a = repoPaths(makeRepo(), env);
  const b = repoPaths(makeRepo(), env);
  // Project A, item one: a standard feature with the whole record behind it.
  const one = createWork(a, "One");
  one.route = "standard";
  one.type = "feature";
  one.phaseAt = { build: at(0), gate: at(10), deliver: at(30) };
  one.rounds = { judgement: 2, validation: 1 };
  const task = (n: string) => ({
    task: n,
    message: `M-${n}`,
    criteria: ["AC-1"],
    text: n,
    branch: `crew/${n}`,
    worktree: "",
    openedAt: at(0),
  });
  one.tasks = [
    {
      ...task("T-1"),
      verdict: "proven",
      gate: { round: 2, at: at(20), status: "pass", runs: [], scope: [] },
    },
    {
      ...task("T-2"),
      verdict: "unproven",
      gate: { round: 1, at: at(20), status: "fail", runs: [], scope: [] },
    },
    task("T-3"),
  ];
  one.decisions = [
    { id: "D-1", question: "q1", answer: "a", by: "user" },
    { id: "D-2", question: "q2", answer: "b", by: "validator" },
    { id: "D-3", question: "q3", answer: "c", by: "agent" },
    { id: "D-4", question: "open" },
  ];
  saveWork(a, one);
  const evidence: Evidence = {
    ...emptyEvidence(),
    fingerprint: "sha256:f",
    roles: [
      {
        agent: "expert-1",
        at: at(1),
        tokens: 100,
        tokensFrom: "transcript",
        file: "conclave/expert-1.md",
        personality: "creative",
      },
      {
        agent: "expert-2",
        at: at(1),
        tokens: 50,
        tokensFrom: "transcript",
        file: "conclave/expert-2.md",
        personality: "conservative",
      },
      { agent: "judge", at: at(2), tokens: 30, tokensFrom: "transcript", file: null },
    ],
    judgement: [
      ruling(
        "code-quality",
        "not-proven",
        [
          { file: "src/a.ts", line: 1, text: "a defect", severity: "defect" },
          { file: "src/b.ts", line: 2, text: "debt", severity: "defect", outside: true },
          { file: "src/a.ts", line: 3, text: "a note", severity: "advisory" },
        ],
        "review-code-quality",
      ),
      ruling("ui-ux", "not-run", []),
    ],
    runs: [run("test", "pass"), run("lint", "skipped")],
  };
  saveEvidence(a, one.id, evidence);
  const ledger = emptyLedger();
  addObjection(ledger, "no index", "fault-finder", "advisory");
  const blocking = addObjection(ledger, "data lost", "fault-finder", "blocking");
  waiveObjection(ledger, blocking.id, "the table is small", { by: "user" });
  saveLedger(a, one.id, ledger);
  // Project A, item two, and project B's item: bare fast fixes.
  const two = createWork(a, "Two");
  two.route = "fast";
  two.type = "fix";
  two.kind = "issue";
  saveWork(a, two);
  const three = createWork(b, "Three");
  three.route = "fast";
  three.type = "fix";
  saveWork(b, three);

  const m = computeMetrics([a, b]);
  expect(m.projects).toEqual([a.root, b.root]);
  expect(m.items).toEqual({
    total: 3,
    byRoute: { standard: 1, fast: 2 },
    byType: { feature: 1, fix: 2 },
    // A record without a kind (written before 0.8.0) counts as a feature.
    byKind: { feature: 2, issue: 1 },
  });
  expect(m.rounds).toEqual({ judgement: 2, validation: 1, gate: 3 });
  expect(m.tokens).toEqual({
    byRole: { expert: 150, judge: 30 },
    byPersonality: { creative: 100, conservative: 50 },
    total: 180,
  });
  expect(m.defects).toEqual({ byReviewer: { "review-code-quality": 1 } });
  expect(m.tasks).toEqual({ opened: 3, proven: 1, unproven: 1 });
  expect(m.objections).toEqual({ byStatus: { open: 1, waived: 1 } });
  expect(m.decisions).toEqual({ total: 3, byUser: 1, byValidator: 1, byAgent: 1 });
  expect(m.gates).toEqual({ notRun: 1, skipped: 1 });
  expect(m.phaseMinutes).toEqual({ build: 10, gate: 20 });
  const text = metricsText(m);
  expect(text).toContain("metrics of 2 projects");
  expect(text).toContain("items: 3 (fast 2, standard 1; feature 2, issue 1)");
  expect(text).toContain("tokens: 180 (expert 150, judge 30)");
  expect(text).toContain("defects upheld: 1 (review-code-quality 1)");
  expect(text).toContain("minutes per phase: build 10, gate 20");
  // A project with no work folder counts nothing and breaks nothing.
  expect(computeMetrics([repoPaths(makeRepo(), env)]).items.total).toBe(0);
});

test("SP3-T6 AC-4: computeMetrics counts every verification, the defect marks and the agreement (verified over verified plus disputed, two decimals, null without a judged defect); an item without an evidence file counts nothing", () => {
  const env = testEnv();
  const a = repoPaths(makeRepo(), env);
  const one = createWork(a, "One");
  saveWork(a, one);
  const verification = (what: Verification["what"], ref: string): Verification => ({
    what,
    ref,
    question: "q",
    answer: { type: "noul", noul: 0.9 },
    confidence: 0.9,
    model: "file",
    at: "2026-10-19T10:00:00.000Z",
  });
  saveEvidence(a, one.id, {
    ...emptyEvidence(),
    judgement: [
      {
        gate: "code-quality",
        verdict: "not-proven",
        at: "2026-10-19T10:00:00.000Z",
        fingerprint: "f",
        findings: [
          {
            file: "src/a.ts",
            line: 1,
            text: "a",
            severity: "defect",
            verification: { status: "verified", confidence: 0.9 },
          },
          {
            file: "src/a.ts",
            line: 2,
            text: "b",
            severity: "defect",
            verification: { status: "disputed", confidence: 0.95 },
          },
          {
            file: "src/a.ts",
            line: 3,
            text: "c",
            severity: "defect",
            verification: {
              status: "unverified",
              reason: "between the thresholds",
              confidence: 0.5,
            },
          },
          {
            file: "src/z.ts",
            line: 1,
            text: "d",
            severity: "defect",
            outside: true,
            verification: { status: "verified", confidence: 0.9 },
          },
          {
            file: "src/a.ts",
            line: 4,
            text: "e",
            severity: "advisory",
            verification: { status: "disputed", confidence: 0.9 },
          },
        ],
      },
    ],
    verifications: [
      verification("defect", "code-quality src/a.ts:1"),
      verification("defect", "code-quality src/a.ts:2"),
      verification("defect", "code-quality src/a.ts:3"),
      verification("validator", "complete-gap-round v1"),
      verification("triage", "priority"),
    ],
  });
  const two = createWork(a, "Two");
  saveWork(a, two);
  expect(computeMetrics([a]).verifications).toEqual({
    total: 5,
    verified: 1,
    disputed: 1,
    unverified: 1,
    agreement: 0.5,
  });
  expect(metricsText(computeMetrics([a]))).toContain(
    "\n  verifications: 5 (defects verified 1, disputed 1, unverified 1; agreement 0.5)\n",
  );
  const b = repoPaths(makeRepo(), env);
  expect(computeMetrics([b]).verifications).toEqual({
    total: 0,
    verified: 0,
    disputed: 0,
    unverified: 0,
    agreement: null,
  });
  expect(metricsText(computeMetrics([b]))).toContain(
    "verifications: 0 (defects verified 0, disputed 0, unverified 0; agreement none)",
  );
});

test("SP8-T1 AC-5 (finding 90): the agreement rounds to two decimals (two verified, one disputed: 0.67)", () => {
  const a = repoPaths(makeRepo(), testEnv());
  const one = createWork(a, "One");
  saveWork(a, one);
  const finding = (line: number, status: "verified" | "disputed") => ({
    file: "src/a.ts",
    line,
    text: "t",
    severity: "defect" as const,
    verification: { status, confidence: 0.9 },
  });
  saveEvidence(a, one.id, {
    ...emptyEvidence(),
    judgement: [
      {
        gate: "code-quality",
        verdict: "not-proven",
        at: "2026-10-19T10:00:00.000Z",
        fingerprint: "f",
        findings: [finding(1, "verified"), finding(2, "verified"), finding(3, "disputed")],
      },
    ],
    verifications: [],
  });
  expect(computeMetrics([a]).verifications).toMatchObject({
    verified: 2,
    disputed: 1,
    agreement: 0.67,
  });
});

const K_AT = "2026-10-20T00:00:00.000Z";
function kEntry(
  id: string,
  kind: KnowledgeEntry["kind"],
  workspace: string,
  confirmedBy: KnowledgeRef[],
  contradictedBy: KnowledgeRef[],
): KnowledgeEntry {
  return {
    id,
    kind,
    title: `${id} title`,
    workspace,
    project: "shop",
    projectRoot: "/real/shop",
    confidential: true,
    item: null,
    commit: null,
    stacks: [],
    paths: [],
    words: [],
    text: "t",
    source: null,
    createdAt: K_AT,
    confirmedBy,
    contradictedBy,
  };
}
const ref = (item: string): KnowledgeRef => ({ item, project: "shop", at: K_AT });
const ZERO_KINDS = {
  "stack-preference": 0,
  "validated-solution": 0,
  documentation: 0,
  "root-cause": 0,
  general: 0,
};

test("SP4-T5 AC-4: knowledgeFigures counts the visible entries per kind, sums confirmed and contradicted over their refs, counts the items whose learn confirmed an entry, leaves a hidden entry out of every figure and row and gives zeros for no base; computeMetrics carries the figures without the rows and metricsText prints the line", () => {
  const env = testEnv();
  const a = repoPaths(makeRepo(), env);
  const b = repoPaths(makeRepo(), env);
  const scope: KnowledgeScope = { workspace: "acme", project: "shop", projectRoot: a.root };
  const base: KnowledgeBase = {
    version: 1,
    next: 7,
    entries: [
      kEntry("K-1", "general", "acme", [ref("i1"), ref("i2")], []),
      kEntry("K-2", "general", "acme", [], [ref("i3")]),
      kEntry("K-3", "validated-solution", "acme", [ref("i1")], []),
      kEntry("K-4", "validated-solution", "acme", [], []),
      kEntry("K-5", "validated-solution", "acme", [ref("i4")], []),
      // Another workspace's marked entry: hidden, so its refs count for nothing.
      kEntry("K-6", "root-cause", "globex", [ref("x")], [ref("y")]),
    ],
  };
  const one = createWork(a, "One");
  one.learned = { at: K_AT, entries: ["K-7"], confirmed: ["K-1"] };
  saveWork(a, one);
  const two = createWork(a, "Two");
  two.learned = { at: K_AT, entries: [], confirmed: ["K-3", "K-5"] };
  saveWork(a, two);
  const three = createWork(b, "Three");
  three.learned = { at: K_AT, entries: ["K-8"], confirmed: [] };
  saveWork(b, three);
  saveWork(b, createWork(b, "Four"));
  const figures = knowledgeFigures(base, scope, [a, b]);
  const row = (
    id: string,
    kind: KnowledgeEntry["kind"],
    confirmed: number,
    contradicted: number,
  ) => ({ id, kind, title: `${id} title`, workspace: "acme", confirmed, contradicted });
  expect(figures).toEqual({
    entries: { ...ZERO_KINDS, general: 2, "validated-solution": 3 },
    confirmed: 4,
    contradicted: 1,
    cited: 2,
    rows: [
      row("K-1", "general", 2, 0),
      row("K-2", "general", 0, 1),
      row("K-3", "validated-solution", 1, 0),
      row("K-4", "validated-solution", 0, 0),
      row("K-5", "validated-solution", 1, 0),
    ],
  });
  const zeros = { entries: ZERO_KINDS, confirmed: 0, contradicted: 0, cited: 0 };
  expect(knowledgeFigures(null, scope, [a, b])).toEqual({ ...zeros, rows: [] });
  const m = computeMetrics([a, b], figures);
  expect(m.knowledge).toEqual({
    entries: { ...ZERO_KINDS, general: 2, "validated-solution": 3 },
    confirmed: 4,
    contradicted: 1,
    cited: 2,
  });
  expect("rows" in m.knowledge).toBe(false);
  expect(metricsText(m)).toContain(
    "\n  knowledge: 5 entries (general 2, validated-solution 3), confirmed 4, contradicted 1, cited by 2 items",
  );
  // A caller with no base (no figures given): zeros, and the line still printed.
  expect(computeMetrics([a]).knowledge).toEqual(zeros);
  expect(metricsText(computeMetrics([a]))).toContain(
    "\n  knowledge: 0 entries, confirmed 0, contradicted 0, cited by 0 items",
  );
});

test("CON6-AC-7-tokens (finding 66): with no role record, crew metrics counts the judgement records' tokens", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const item = createWork(paths, "No roles");
  saveWork(paths, item);
  const evidence: Evidence = {
    ...emptyEvidence(),
    fingerprint: "sha256:f",
    judgement: [
      { ...ruling("code-quality", "proven", []), tokens: 40 },
      { ...ruling("security", "proven", []), tokens: 60 },
    ],
  };
  expect(evidence.roles).toBeUndefined();
  saveEvidence(paths, item.id, evidence);
  expect(computeMetrics([paths]).tokens.total).toBe(100);
});

test("CON6-AC-7-by (finding 53): crew metrics counts a decision answered with no by as the user's", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const item = createWork(paths, "Old decision");
  item.decisions = [
    { id: "D-1", question: "q1", answer: "a" },
    { id: "D-2", question: "q2", answer: "b", by: "validator" },
    { id: "D-3", question: "open" },
  ];
  saveWork(paths, item);
  expect(computeMetrics([paths]).decisions).toEqual({
    total: 2,
    byUser: 1,
    byValidator: 1,
    byAgent: 0,
  });
});
