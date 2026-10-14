import { expect, test } from "bun:test";
import { emptyEvidence } from "../src/evidence.ts";
import {
  isInterfacePath,
  notRunRecord,
  parseRulings,
  plannedJudgementGates,
  recordJudgement,
  stampRuling,
} from "../src/judgement.ts";
import { DEFAULT_POLICY } from "../src/policy.ts";
import type { Evidence, JudgementGateName, Policy } from "../src/types.ts";

const names = (planned: { gate: string }[]) => planned.map((p) => p.gate);

test("SP2b: judgement gates are planned from the route, the risk areas, the diff and the policy", () => {
  expect(plannedJudgementGates("fast", [], ["src/a.ts"], DEFAULT_POLICY)).toEqual([]);
  expect(plannedJudgementGates("fast", [], ["src/App.vue"], DEFAULT_POLICY)).toEqual([
    { gate: "ui-ux", reason: "interface files: src/App.vue" },
  ]);
  expect(plannedJudgementGates("standard", [], ["src/a.ts"], DEFAULT_POLICY)).toEqual([
    { gate: "code-quality", reason: "standard route" },
    { gate: "test-quality", reason: "standard route" },
  ]);
  expect(names(plannedJudgementGates("standard", ["auth"], ["src/a.ts"], DEFAULT_POLICY))).toEqual([
    "code-quality",
    "test-quality",
    "security",
  ]);
  expect(plannedJudgementGates("standard", ["auth", "payments"], [], DEFAULT_POLICY)[2]).toEqual({
    gate: "security",
    reason: "risk areas auth, payments",
  });
  expect(
    plannedJudgementGates(
      "full",
      [],
      ["src/a.ts", "resources/views/home.blade.php"],
      DEFAULT_POLICY,
    ),
  ).toEqual([
    { gate: "code-quality", reason: "full route" },
    { gate: "test-quality", reason: "full route" },
    { gate: "security", reason: "full route" },
    { gate: "ui-ux", reason: "interface files: resources/views/home.blade.php" },
    { gate: "risk", reason: "full route" },
  ]);
  // The policy adds what the route does not; a gate already planned keeps its first reason.
  const policy: Policy = { ...DEFAULT_POLICY, judgementGates: ["security", "code-quality"] };
  expect(plannedJudgementGates("fast", [], ["src/a.ts"], policy)).toEqual([
    { gate: "security", reason: "policy" },
    { gate: "code-quality", reason: "policy" },
  ]);
  expect(plannedJudgementGates("standard", [], ["src/a.ts"], policy)).toEqual([
    { gate: "code-quality", reason: "standard route" },
    { gate: "test-quality", reason: "standard route" },
    { gate: "security", reason: "policy" },
  ]);
  // Many interface files: the first three are named.
  expect(
    plannedJudgementGates("fast", [], ["a.css", "b.scss", "c.less", "d.html"], DEFAULT_POLICY),
  ).toEqual([{ gate: "ui-ux", reason: "interface files: a.css, b.scss, c.less, +1 more" }]);
});

test("SP2b: an interface file is known by its extension or by living under resources/views/", () => {
  for (const path of [
    "src/App.vue",
    "src/x.svelte",
    "src/B.tsx",
    "src/c.jsx",
    "src/d.astro",
    "resources/views/a.blade.php",
    "public/index.html",
    "s.css",
    "s.scss",
    "s.less",
    "resources/views/mail/x.php",
    "apps/web/resources/views/y.txt",
  ])
    expect(isInterfacePath(path)).toBe(true);
  for (const path of [
    "src/a.ts",
    "src/a.php",
    "app/Http/Controllers/A.php",
    "views/a.txt",
    "docs/a.md",
    "src/Views.ts",
  ])
    expect(isInterfacePath(path)).toBe(false);
});

test("SP2b: a ruling file is checked before anything is recorded", () => {
  const planned: readonly JudgementGateName[] = ["code-quality", "test-quality"];
  const parse = (rulings: unknown) => parseRulings({ rulings }, planned);
  expect(parseRulings("x", planned)).toEqual({
    refused: 'the ruling file is a JSON object with a "rulings" list',
  });
  expect(parse([])).toEqual({ refused: "the ruling file has no rulings" });
  expect(parse([{ gate: "style", verdict: "proven" }])).toEqual({
    refused:
      "ruling 1: unknown judgement gate: style (code-quality, test-quality, security, ui-ux, risk)",
  });
  expect(parse([{ gate: "ui-ux", verdict: "proven" }])).toEqual({
    refused: "ruling 1: ui-ux is not planned for this item (planned: code-quality, test-quality)",
  });
  expect(parse([{ gate: "code-quality", verdict: "maybe" }])).toEqual({
    refused:
      'ruling 1 (code-quality): verdict is proven or not-proven, not maybe; a gate that could not run is recorded with crew judgement <id> record code-quality --not-run --reason "<why>"',
  });
  const finding = (f: Record<string, unknown>) =>
    parse([{ gate: "code-quality", verdict: "proven", findings: [f] }]);
  expect(finding({ text: "x", severity: "advisory" })).toEqual({
    refused: "finding 1 of code-quality: needs a file",
  });
  expect(finding({ file: "src/a.ts", severity: "advisory" })).toEqual({
    refused: "finding 1 of code-quality: needs a text",
  });
  expect(finding({ file: "src/a.ts", text: "x", severity: "nit" })).toEqual({
    refused: "finding 1 of code-quality: severity is defect or advisory",
  });
  expect(finding({ file: "src/a.ts", text: "x", severity: "defect", line: 0 })).toEqual({
    refused: "finding 1 of code-quality: line is a positive integer",
  });
  expect(
    parse([
      {
        gate: "code-quality",
        verdict: "not-proven",
        findings: [{ file: "src/a.ts", text: "x", severity: "advisory" }],
      },
    ]),
  ).toEqual({
    refused:
      "ruling 1 (code-quality): not proven with no defect finding; the judge rules not proven on defects, or rules proven",
  });
  expect(parse([{ gate: "code-quality", verdict: "proven", tokens: "many" }])).toEqual({
    refused: "ruling 1 (code-quality): tokens is a number",
  });
  expect(
    parse([
      { gate: "code-quality", verdict: "proven" },
      { gate: "code-quality", verdict: "proven" },
    ]),
  ).toEqual({ refused: "two rulings for code-quality in one file" });
  expect(
    parse([
      {
        gate: "code-quality",
        verdict: "proven",
        reviewer: "code-quality",
        judge: "judge",
        findings: [],
        tokens: 900,
      },
      {
        gate: "test-quality",
        verdict: "not-proven",
        findings: [
          {
            file: "./tests/a.test.ts",
            line: 3,
            text: "passes by construction",
            severity: "defect",
          },
        ],
      },
    ]),
  ).toEqual({
    rulings: [
      {
        gate: "code-quality",
        verdict: "proven",
        reviewer: "code-quality",
        judge: "judge",
        findings: [],
        tokens: 900,
      },
      {
        gate: "test-quality",
        verdict: "not-proven",
        findings: [
          { file: "tests/a.test.ts", line: 3, text: "passes by construction", severity: "defect" },
        ],
      },
    ],
  });
});

test("SP2b: a ruling is stamped with the code it judged, its findings outside the change marked, and it replaces the earlier ruling for the gate", () => {
  const ruling = {
    gate: "code-quality" as const,
    verdict: "not-proven" as const,
    findings: [
      { file: "src/a.ts", line: 1, text: "dead path", severity: "defect" as const },
      { file: "src/legacy.ts", text: "duplicated", severity: "defect" as const },
    ],
  };
  const record = stampRuling(ruling, "f1", ["src/a.ts"]);
  expect(record).toMatchObject({ gate: "code-quality", verdict: "not-proven", fingerprint: "f1" });
  expect(typeof record.at).toBe("string");
  expect(record.findings).toEqual([
    { file: "src/a.ts", line: 1, text: "dead path", severity: "defect" },
    { file: "src/legacy.ts", text: "duplicated", severity: "defect", outside: true },
  ]);
  const evidence: Evidence = emptyEvidence();
  recordJudgement(evidence, record);
  recordJudgement(evidence, notRunRecord("ui-ux", "no browser", "f1"));
  recordJudgement(
    evidence,
    stampRuling({ ...ruling, verdict: "proven", findings: [] }, "f2", ["src/a.ts"]),
  );
  expect(evidence.judgement?.map((j) => `${j.gate}:${j.verdict}:${j.fingerprint}`)).toEqual([
    "ui-ux:not-run:f1",
    "code-quality:proven:f2",
  ]);
  expect(evidence.judgement?.[0]).toMatchObject({ reason: "no browser", findings: [] });
});
