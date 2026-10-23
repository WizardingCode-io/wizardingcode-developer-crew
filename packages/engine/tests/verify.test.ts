import { expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { jevConfig } from "../src/jev.ts";
import { hunkLines } from "../src/judgement.ts";
import { DEFAULT_POLICY } from "../src/policy.ts";
import type { JudgementRecord, Policy } from "../src/types.ts";
import {
  applyDefectMarks,
  CAPS,
  clipAt,
  RUBRIC_QUESTIONS,
  verifyDefects,
  verifyFacts,
  verifyTriage,
  verifyValidator,
} from "../src/verify.ts";
import { tempDir } from "./helpers.ts";

const PATCH = [
  "diff --git a/src/a.ts b/src/a.ts",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1,3 +1,4 @@",
  " const a = 1;",
  "+const b = 2;",
  " const c = 3;",
  " export { a, c };",
  "@@ -20,2 +21,3 @@",
  " function f() {",
  "+  return 1;",
  " }",
  "diff --git a/src/b.ts b/src/b.ts",
  "--- a/src/b.ts",
  "+++ b/src/b.ts",
  "@@ -1,1 +1,2 @@",
  " x",
  "+y",
].join("\n");

function canned(answers: unknown): ReturnType<typeof jevConfig> {
  const file = join(tempDir("crew-verify-"), "answers.json");
  writeFileSync(file, JSON.stringify(answers));
  return jevConfig(
    { WIZARDINGCODE_JEV_ENDPOINT: `file://${file}` } as NodeJS.ProcessEnv,
    DEFAULT_CONFIG,
  );
}
const down = jevConfig(
  { WIZARDINGCODE_JEV_ENDPOINT: "file:///nowhere/answers.json" } as NodeJS.ProcessEnv,
  DEFAULT_CONFIG,
);
const policyWith = (verify: Partial<Policy["verify"]>): Policy => ({
  ...DEFAULT_POLICY,
  verify: { ...DEFAULT_POLICY.verify, ...verify },
});
const record = (
  findings: JudgementRecord["findings"],
  verdict: JudgementRecord["verdict"] = "not-proven",
): JudgementRecord => ({
  gate: "code-quality",
  verdict,
  findings,
  at: "2026-10-19T10:00:00.000Z",
  fingerprint: "f",
});

test("SP3-T6 AC-1: hunkLines finds the hunk of a file's line and its five lines around, null for a line in no hunk or a file the patch does not touch", () => {
  expect(hunkLines(PATCH, "src/a.ts", 2)).toEqual({
    from: 1,
    to: 4,
    text: "1: const a = 1;\n2: const b = 2;\n3: const c = 3;\n4: export { a, c };",
  });
  expect(hunkLines(PATCH, "src/a.ts", 22)).toEqual({
    from: 21,
    to: 23,
    text: "21: function f() {\n22:   return 1;\n23: }",
  });
  expect(hunkLines(PATCH, "src/b.ts", 2)).toEqual({ from: 1, to: 2, text: "1: x\n2: y" });
  expect(hunkLines(PATCH, "src/a.ts", 10)).toBeNull();
  expect(hunkLines(PATCH, "src/c.ts", 1)).toBeNull();
});

test("SP3-T6 AC-1, AC-2: verifyDefects asks the upheld defects inside the hunks (claims: a noul without lines; claims-and-snippets: the lines and a relation), refuses by hand a finding without a line or outside the hunks, caps the sent ones, marks each from the answer, and marks every sent one unavailable when Jev is down, recording nothing", async () => {
  const sent: JudgementRecord[] = [
    record([
      { file: "src/a.ts", line: 2, text: "a copy of logic", severity: "defect" },
      { file: "src/a.ts", text: "no line", severity: "defect" },
      { file: "src/a.ts", line: 10, text: "between hunks", severity: "defect" },
      { file: "src/b.ts", line: 2, text: "dead code", severity: "defect" },
      { file: "src/a.ts", line: 3, text: "advisory", severity: "advisory" },
      { file: "src/z.ts", line: 1, text: "outside", severity: "defect", outside: true },
    ]),
    record([{ file: "src/a.ts", line: 22, text: "proven gate", severity: "defect" }], "proven"),
  ];
  const cfg = canned({ d1: { type: "noul", noul: 0.93 }, d2: { type: "noul", noul: 0.05 } });
  const out = applyDefectMarks(await verifyDefects(cfg, DEFAULT_POLICY, sent, PATCH));
  expect(out.sent).toBe(2);
  expect(out.unavailable).toBeNull();
  const findings = sent[0]?.findings ?? [];
  expect(findings[0]?.verification).toEqual({ status: "verified", confidence: 0.93 });
  expect(findings[1]?.verification).toEqual({ status: "unverified", reason: "no line" });
  expect(findings[2]?.verification).toEqual({
    status: "unverified",
    reason: "line outside the change's hunks",
  });
  expect(findings[3]?.verification).toEqual({ status: "disputed", confidence: 0.95 });
  expect(findings[4]?.verification).toBeUndefined();
  expect(findings[5]?.verification).toBeUndefined();
  expect(sent[1]?.findings[0]?.verification).toBeUndefined();
  expect(out.records.map((r) => [r.what, r.ref, r.confidence, r.model])).toEqual([
    ["defect", "code-quality src/a.ts:2", 0.93, "file"],
    ["defect", "code-quality src/b.ts:2", 0.95, "file"],
  ]);
  expect(out.records[0]?.question).toBe(
    "Does the finding at `findings.d1`, taken at its word (its `text` about `file` at `line`), describe a defect of the kind `findings.d1.rubric` names?",
  );
  expect(out.records[0]?.answer).toEqual({ type: "noul", noul: 0.93 });
  // What leaves the machine, read off the request body through a fake fetch: under claims the
  // finding's fields and the rubric's question, no lines, a noul; under claims-and-snippets the
  // hunk's lines too, and a relation choice (security review of SP3 Task 6).
  const bodies: {
    state: { findings: Record<string, Record<string, unknown>> };
    questions: Record<string, { type: string }>;
  }[] = [];
  const spy = jevConfig(
    { WIZARDINGCODE_JEV_API_KEY: "sk-test" } as NodeJS.ProcessEnv,
    DEFAULT_CONFIG,
  );
  const answering = (answers: unknown): typeof fetch =>
    (async (_url: unknown, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ model: "jev-1.13.0", answers }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
  const claims = [record([{ file: "src/a.ts", line: 2, text: "a copy", severity: "defect" }])];
  applyDefectMarks(
    await verifyDefects(spy, DEFAULT_POLICY, claims, PATCH, {
      fetch: answering({ d1: { type: "noul", noul: 0.9 } }),
    }),
  );
  expect(bodies[0]?.state.findings.d1).toEqual({
    file: "src/a.ts",
    line: 2,
    text: "a copy",
    rubric: RUBRIC_QUESTIONS["code-quality"],
  });
  expect(bodies[0]?.questions.d1?.type).toBe("noul");
  expect(claims[0]?.findings[0]?.verification).toEqual({ status: "verified", confidence: 0.9 });
  const snippets = [record([{ file: "src/a.ts", line: 2, text: "a copy", severity: "defect" }])];
  const withSnippets = applyDefectMarks(
    await verifyDefects(spy, policyWith({ send: "claims-and-snippets" }), snippets, PATCH, {
      fetch: answering({
        d1: {
          type: "choice",
          choice: "contradicts",
          probabilities: { contradicts: 0.95 },
          confidence: 0.95,
        },
      }),
    }),
  );
  expect(bodies[1]?.state.findings.d1?.lines).toBe(
    "1: const a = 1;\n2: const b = 2;\n3: const c = 3;\n4: export { a, c };",
  );
  expect(bodies[1]?.questions.d1?.type).toBe("choice");
  expect(withSnippets.records[0]?.question).toBe(
    "What is the relation between the cited lines `findings.d1.lines` and the finding's `text` at `findings.d1`?",
  );
  expect(withSnippets.records[0]?.model).toBe("jev-1.13.0");
  expect(snippets[0]?.findings[0]?.verification).toEqual({ status: "disputed", confidence: 0.95 });
  // The finding's text leaves clipAt at 1000 characters.
  const long = [
    record([{ file: "src/a.ts", line: 2, text: "x".repeat(1200), severity: "defect" }]),
  ];
  await verifyDefects(spy, DEFAULT_POLICY, long, PATCH, {
    fetch: answering({ d1: { type: "noul", noul: 0.9 } }),
  });
  expect(String(bodies[2]?.state.findings.d1?.text).length).toBe(1001);
  // The cap counts the candidates that would be sent, not the by-hand refusals.
  const capped = [
    record([
      { file: "src/a.ts", line: 2, text: "one", severity: "defect" },
      { file: "src/a.ts", text: "no line", severity: "defect" },
      { file: "src/b.ts", line: 2, text: "two", severity: "defect" },
      { file: "src/a.ts", line: 22, text: "three", severity: "defect" },
    ]),
  ];
  const cappedOut = applyDefectMarks(
    await verifyDefects(
      canned({ d1: { type: "noul", noul: 0.9 }, d2: { type: "noul", noul: 0.9 } }),
      policyWith({ maxClaimsPerItem: 2 }),
      capped,
      PATCH,
    ),
  );
  expect(cappedOut.sent).toBe(2);
  expect(capped[0]?.findings.map((f) => f.verification?.status ?? f.verification?.reason)).toEqual([
    "verified",
    "unverified",
    "verified",
    "unverified",
  ]);
  expect(capped[0]?.findings[3]?.verification).toEqual({
    status: "unverified",
    reason: "over verify.maxClaimsPerItem",
  });
  // Down: nothing recorded, every sent finding marked.
  const unavailable = [record([{ file: "src/a.ts", line: 2, text: "one", severity: "defect" }])];
  const downOut = applyDefectMarks(await verifyDefects(down, DEFAULT_POLICY, unavailable, PATCH));
  expect(downOut).toMatchObject({
    records: [],
    unavailable: "canned answers unreadable: /nowhere/answers.json",
    sent: 1,
  });
  expect(unavailable[0]?.findings[0]?.verification).toEqual({
    status: "unverified",
    reason: "jev unavailable: canned answers unreadable: /nowhere/answers.json",
  });
  // Nothing to send: no ask.
  expect(
    await verifyDefects(
      down,
      DEFAULT_POLICY,
      [record([{ file: "src/a.ts", text: "x", severity: "defect" }])],
      PATCH,
    ),
  ).toMatchObject({
    records: [],
    unavailable: null,
    sent: 0,
    marks: [{ mark: { status: "unverified", reason: "no line" } }],
  });
});

test("SP3-T6 AC-1, AC-2, AC-3: verifyValidator is verified on two yeses, disputed on a no naming the condition, unverified between or when Jev is down (nothing recorded)", async () => {
  const input = {
    conclave: "# Conclave\n",
    decisions: [{ id: "D-1", question: "q", answer: "a", default: null }],
    objections: [],
  };
  const yes = await verifyValidator(
    canned({ v1: { type: "noul", noul: 0.9 }, v2: { type: "noul", noul: 0.95 } }),
    DEFAULT_POLICY,
    input,
  );
  expect(yes).toMatchObject({ status: "verified", condition: null });
  expect(yes.records.map((r) => [r.what, r.ref, r.confidence])).toEqual([
    ["validator", "complete-gap-round v1", 0.9],
    ["validator", "complete-gap-round v2", 0.95],
  ]);
  const no = await verifyValidator(
    canned({ v1: { type: "noul", noul: 0.9 }, v2: { type: "noul", noul: 0.03 } }),
    DEFAULT_POLICY,
    input,
  );
  expect(no).toMatchObject({
    status: "disputed",
    condition:
      "Is every warning listed in `conclave` under 'Warnings' that names a security, data or payment risk present in `objections`?",
    confidence: 0.97,
  });
  expect(no.records).toHaveLength(2);
  const between = await verifyValidator(
    canned({ v1: { type: "noul", noul: 0.5 }, v2: { type: "noul", noul: 0.9 } }),
    DEFAULT_POLICY,
    input,
  );
  expect(between).toMatchObject({
    status: "unverified",
    condition: null,
    confidence: 0.5,
    reason: "between the thresholds",
  });
  expect(await verifyValidator(down, DEFAULT_POLICY, input)).toEqual({
    status: "unverified",
    condition: null,
    confidence: null,
    reason: "jev unavailable: canned answers unreadable: /nowhere/answers.json",
    records: [],
  });
});

test("SP3-T6 AC-1: verifyFacts marks each found fact from its relation and records it; down marks them all and records nothing", async () => {
  const facts = [
    { id: "F-1", claim: "a", quote: "q1", excerpt: "e1" },
    { id: "F-2", claim: "b", quote: "q2", excerpt: "e2" },
  ];
  const out = await verifyFacts(
    canned({
      f1: { type: "choice", choice: "supports", probabilities: { supports: 0.9 }, confidence: 0.9 },
      f2: {
        type: "choice",
        choice: "contradicts",
        probabilities: { contradicts: 0.85 },
        confidence: 0.85,
      },
    }),
    DEFAULT_POLICY,
    facts,
  );
  expect(out.marks).toEqual({
    "F-1": { status: "verified", confidence: 0.9 },
    "F-2": { status: "disputed", confidence: 0.85 },
  });
  expect(out.records.map((r) => [r.what, r.ref, r.confidence])).toEqual([
    ["fact", "F-1", 0.9],
    ["fact", "F-2", 0.85],
  ]);
  const gone = await verifyFacts(down, DEFAULT_POLICY, facts);
  expect(gone.records).toEqual([]);
  expect(gone.marks["F-1"]).toEqual({
    status: "unverified",
    confidence: null,
    reason: "jev unavailable: canned answers unreadable: /nowhere/answers.json",
  });
  expect(await verifyFacts(down, DEFAULT_POLICY, [])).toEqual({
    marks: {},
    unavailable: null,
    records: [],
  });
});

test("SP3-T6 AC-1, AC-2, AC-3: verifyTriage proposes the highest-probability level, capped at the source's, only when the score's confidence reaches the threshold; records the four answers; down proposes nothing and records nothing", async () => {
  const input = {
    request: {
      text: "Checkout is down for every client",
      channel: "task-manager",
      connector: "clickup",
      proposed_priority: "high" as const,
    },
    business_priorities: "The checkout first.",
    queue: [],
  };
  const legend = {
    "1": "a cosmetic or convenience change nobody is waiting on",
    "2": "ordinary work the business expects in its turn",
    "3": "work a signed deadline or a named client commitment depends on",
    "4": "production is down or a client cannot work until it is done",
  };
  const score = (p: Record<string, number>, confidence: number) => ({
    type: "score",
    score: 3.8,
    legend,
    probabilities: p,
    confidence,
  });
  const flags = {
    is_production_down: { type: "noul", noul: 0.96 },
    names_a_signed_deadline: { type: "noul", noul: 0.05 },
    is_vague: { type: "noul", noul: 0.1 },
  };
  const capped = await verifyTriage(
    canned({ priority: score({ "1": 0.01, "2": 0.04, "3": 0.15, "4": 0.8 }, 0.86), ...flags }),
    DEFAULT_POLICY,
    input,
  );
  expect(capped.proposal).toEqual({
    level: "high",
    confidence: 0.86,
    probabilities: { low: 0.01, normal: 0.04, high: 0.15, blocker: 0.8 },
    flags: { is_production_down: 0.96, names_a_signed_deadline: 0.05, is_vague: 0.1 },
    capped: true,
  });
  expect(capped.records.map((r) => [r.what, r.ref])).toEqual([
    ["triage", "is_production_down"],
    ["triage", "names_a_signed_deadline"],
    ["triage", "is_vague"],
    ["triage", "priority"],
  ]);
  const lower = await verifyTriage(
    canned({ priority: score({ "1": 0.1, "2": 0.7, "3": 0.15, "4": 0.05 }, 0.9), ...flags }),
    DEFAULT_POLICY,
    input,
  );
  expect(lower.proposal).toMatchObject({ level: "normal", capped: false });
  const unsure = await verifyTriage(
    canned({ priority: score({ "1": 0.1, "2": 0.5, "3": 0.3, "4": 0.1 }, 0.42), ...flags }),
    DEFAULT_POLICY,
    input,
  );
  expect(unsure.proposal).toBeNull();
  expect(unsure.reason).toBe("confidence 0.42 under 0.8");
  expect(unsure.records).toHaveLength(4);
  const gone = await verifyTriage(down, DEFAULT_POLICY, input);
  expect(gone).toEqual({
    proposal: null,
    reason: "jev unavailable: canned answers unreadable: /nowhere/answers.json",
    records: [],
  });
});

test("SP8-T1 AC-5 (finding 90): clipAt keeps a text within its cap with an ellipsis, and the validator's conclave leaves clipAt at 16 KiB", async () => {
  expect(clipAt("abcdef", 3)).toBe("abc…");
  expect(clipAt("abc", 3)).toBe("abc");
  expect(CAPS).toEqual({
    findingText: 1000,
    conclave: 16 * 1024,
    request: 8 * 1024,
    priorities: 8 * 1024,
  });
  const bodies: { state: { conclave: string } }[] = [];
  const spy = jevConfig(
    { WIZARDINGCODE_JEV_API_KEY: "sk-test" } as NodeJS.ProcessEnv,
    DEFAULT_CONFIG,
  );
  const fetchSpy = (async (_url: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(
      JSON.stringify({
        model: "jev-1.13.0",
        answers: { v1: { type: "noul", noul: 0.9 }, v2: { type: "noul", noul: 0.9 } },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
  const out = await verifyValidator(
    spy,
    DEFAULT_POLICY,
    { conclave: "x".repeat(20000), decisions: [], objections: [] },
    { fetch: fetchSpy },
  );
  expect(out.status).toBe("verified");
  expect(bodies[0]?.state.conclave.length).toBe(16 * 1024 + 1);
});
