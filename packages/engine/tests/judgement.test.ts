import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { emptyEvidence } from "../src/evidence.ts";
import {
  contradiction,
  fillTokens,
  judgementRows,
  notRunRecord,
  parseRulings,
  plannedJudgementGates,
  plannedTaskJudgement,
  readReviewInputs,
  recordJudgement,
  reviewDir,
  scopeHash,
  stampRuling,
  writeReviewInputs,
} from "../src/judgement.ts";
import { isInterfacePath } from "../src/paths-kind.ts";
import { DEFAULT_POLICY } from "../src/policy.ts";
import type { Evidence, JudgementGateName, Policy } from "../src/types.ts";
import { createWork } from "../src/work.ts";
import { makeRepo, repoPaths, testEnv, write } from "./helpers.ts";

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
    // SP7a: the registry seats the architects on the full route (Task 1 ruling).
    { gate: "architecture", reason: "full route" },
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
    // A test of an interface file is not an interface file (review of SP2b, finding 3).
    "src/a.test.tsx",
    "src/b.spec.jsx",
    "src/C.stories.tsx",
    "src/__tests__/d.tsx",
    "resources/views/__tests__/e.blade.php",
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
      "ruling 1: unknown judgement gate: style (code-quality, test-quality, security, ui-ux, risk, architecture, data, infra, strategy)",
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
  expect(finding({ file: "src/a.ts", text: "x", severity: "defect", line: -1 })).toEqual({
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
  const record = stampRuling(ruling, "f1", ["src/a.ts"], "w1");
  expect(record).toMatchObject({ gate: "code-quality", verdict: "not-proven", fingerprint: "f1" });
  expect(typeof record.at).toBe("string");
  expect(record.findings).toEqual([
    { file: "src/a.ts", line: 1, text: "dead path", severity: "defect" },
    { file: "src/legacy.ts", text: "duplicated", severity: "defect", outside: true },
  ]);
  // The item's own spec and plan are part of the change: a risk finding on them is not debt (review of SP2b, finding 4).
  const onSpec = stampRuling(
    {
      gate: "risk",
      verdict: "not-proven",
      findings: [
        { file: ".crew/work/w1/spec.md", line: 9, text: "no rollback stated", severity: "defect" },
        {
          file: ".crew/work/w1/plan.md",
          text: "no owner for the manual step",
          severity: "advisory",
        },
        { file: ".crew/work/other/spec.md", text: "another item's spec", severity: "advisory" },
      ],
    },
    "f1",
    ["src/a.ts"],
    "w1",
  );
  expect(onSpec.findings.map((f) => f.outside ?? false)).toEqual([false, false, true]);
  const evidence: Evidence = emptyEvidence();
  recordJudgement(evidence, record);
  recordJudgement(evidence, notRunRecord("ui-ux", "no browser", "f1"));
  recordJudgement(
    evidence,
    stampRuling({ ...ruling, verdict: "proven", findings: [] }, "f2", ["src/a.ts"], "w1"),
  );
  expect(evidence.judgement?.map((j) => `${j.gate}:${j.verdict}:${j.fingerprint}`)).toEqual([
    "ui-ux:not-run:f1",
    "code-quality:proven:f2",
  ]);
  expect(evidence.judgement?.[0]).toMatchObject({ reason: "no browser", findings: [] });
});

test("SP2b minors: proven with a defect inside the change contradicts the judge's own rule; debt and advisories do not", () => {
  const inside = stampRuling(
    {
      gate: "code-quality",
      verdict: "proven",
      findings: [
        { file: "src/legacy.ts", line: 4, text: "duplicated", severity: "defect" },
        { file: "src/a.ts", line: 12, text: "two reasons to change", severity: "defect" },
      ],
    },
    "f1",
    ["src/a.ts"],
    "w1",
  );
  expect(contradiction(inside)).toBe(
    "code-quality: proven with a defect on src/a.ts:12; the judge rules not proven on a defect inside the change, or lowers it to advisory",
  );
  const consistent = stampRuling(
    {
      gate: "code-quality",
      verdict: "proven",
      findings: [
        { file: "src/legacy.ts", text: "duplicated", severity: "defect" },
        { file: "src/a.ts", line: 12, text: "long function", severity: "advisory" },
      ],
    },
    "f1",
    ["src/a.ts"],
    "w1",
  );
  expect(contradiction(consistent)).toBeNull();
  // Not proven on a defect inside the change is the rule itself; a gate not run has no findings.
  expect(contradiction({ ...inside, verdict: "not-proven" })).toBeNull();
  expect(contradiction(notRunRecord("ui-ux", "no browser", "f1"))).toBeNull();
});

test("SP2b minors: a stale row says why, so the panel can print it: ruling on earlier code", () => {
  const work = createWork(repoPaths(makeRepo(), testEnv()), "fix");
  const evidence: Evidence = emptyEvidence();
  recordJudgement(
    evidence,
    stampRuling(
      { gate: "code-quality", verdict: "proven", findings: [] },
      "f1",
      ["src/a.ts"],
      work.id,
    ),
  );
  const planned = [{ gate: "code-quality" as const, reason: "standard route" }];
  expect(judgementRows(work, evidence, planned, "f2", DEFAULT_POLICY)).toEqual([
    {
      gate: "code-quality",
      status: "stale",
      planned: "standard route",
      findings: 0,
      reason: "ruling on earlier code",
    },
  ]);
  // On the code it judged, the row is the verdict and carries no reason.
  expect(judgementRows(work, evidence, planned, "f1", DEFAULT_POLICY)).toEqual([
    { gate: "code-quality", status: "proven", planned: "standard route", findings: 0 },
  ]);
});

test("SP2c AC-5: fillTokens counts only the records of this round, and none when the round's cut is unknown", () => {
  const record = (
    agent: string,
    at: string,
    tokens: number,
  ): Parameters<typeof fillTokens>[1][number] => ({
    agent,
    agentId: agent,
    at,
    tokens,
    tokensFrom: "transcript",
    file: null,
  });
  // An earlier round's records sit last in the list, so only the cut keeps them out.
  const roles = [
    record("review-code-quality", "2026-10-15T12:00:00.000Z", 30000),
    record("judge", "2026-10-15T12:05:00.000Z", 70000),
    record("review-code-quality", "2026-10-15T10:00:00.000Z", 999),
    record("judge", "2026-10-15T10:01:00.000Z", 999),
  ];
  // A ruling the session left at 0, as the judge's answer always is.
  const ruling = () =>
    stampRuling(
      { gate: "code-quality", verdict: "proven", findings: [], tokens: 0 },
      "f1",
      [],
      "w",
    );
  // The records after the cut count; the earlier round's do not.
  const thisRound = [ruling()];
  fillTokens(thisRound, roles, "2026-10-15T11:00:00.000Z");
  expect(thisRound[0]?.tokens).toBe(100000);
  // No cut known (no review inputs): nothing stands in, the tokens stay at 0 rather than borrowed.
  const unknown = [ruling()];
  fillTokens(unknown, roles);
  expect(unknown[0]?.tokens).toBe(0);
});

test("SP7b-T4 AC-4: the review inputs list the captures under review/ui with their console file, sorted by name, and read them back", () => {
  const root = makeRepo({ "src/App.vue": "<template/>" });
  const paths = repoPaths(root, testEnv());
  const work = createWork(paths, "fix");
  write(root, "src/App.vue", "<template>hi</template>");
  const ui = join(paths.crewDir, "work", work.id, "review", "ui");
  mkdirSync(ui, { recursive: true });
  writeFileSync(join(ui, "home-empty.png"), "png");
  writeFileSync(join(ui, "console-home-empty.json"), "[]");
  writeFileSync(join(ui, "cart-error.png"), "png");
  writeFileSync(join(ui, "notes.txt"), "not a capture");
  writeReviewInputs(paths, work, ["src/App.vue"], "f1");
  // The session's captures, as before, in the shape SP9 Task 3 widened (page, state, files, widths, dark, meta, by).
  const captures = [
    {
      page: "cart",
      state: "error",
      file: "review/ui/cart-error.png",
      files: ["review/ui/cart-error.png"],
      widths: [],
      dark: false,
      console: null,
      meta: null,
      by: "session" as const,
    },
    {
      page: "home",
      state: "empty",
      file: "review/ui/home-empty.png",
      files: ["review/ui/home-empty.png"],
      widths: [],
      dark: false,
      console: "review/ui/console-home-empty.json",
      meta: null,
      by: "session" as const,
    },
  ];
  expect(readReviewInputs(paths, work.id)?.captures).toEqual(captures);
  const raw = JSON.parse(
    readFileSync(join(paths.crewDir, "work", work.id, "review", "inputs.json"), "utf8"),
  ) as { captures: unknown };
  expect(raw.captures).toEqual(captures);
  // Without a capture folder the list is empty, never missing.
  const bare = createWork(paths, "fix");
  writeReviewInputs(paths, bare, ["src/App.vue"], "f1");
  expect(readReviewInputs(paths, bare.id)?.captures).toEqual([]);
});

test("SP7b-T5 AC-1: the todo's judgement is planned from its scope, its scope hash is order-free, and the review inputs of a todo live under review/T-n", () => {
  expect(plannedTaskJudgement(["src/App.vue", "src/auth/x.ts"], DEFAULT_POLICY)).toEqual([
    { gate: "ui-ux", reason: "interface files: src/App.vue" },
    { gate: "security", reason: "risk area auth" },
  ]);
  expect(scopeHash(["b", "a", "a"])).toBe(scopeHash(["a", "b"]));
  expect(scopeHash(["a"])).not.toBe(scopeHash(["a", "b"]));
  const root = makeRepo({ "src/App.vue": "<template/>" });
  const paths = repoPaths(root, testEnv());
  const work = createWork(paths, "fix");
  expect(reviewDir(paths, "w1", "T-3").endsWith(join("review", "T-3"))).toBe(true);
  write(root, "src/App.vue", "<template>hi</template>");
  writeReviewInputs(paths, work, ["src/App.vue"], "f1", "T-3");
  expect(
    readFileSync(join(paths.crewDir, "work", work.id, "review", "T-3", "files.txt"), "utf8"),
  ).toBe("src/App.vue\n");
  expect(readReviewInputs(paths, work.id, "T-3")).toMatchObject({ fingerprint: "f1" });
  expect(readReviewInputs(paths, work.id)).toBeNull();
});

test("SP8-T2 AC-4: a ruling with gate strategy parses when the gate is planned", () => {
  const ruling = {
    gate: "strategy",
    verdict: "proven",
    reviewer: "cto",
    judge: "judge",
    findings: [],
    tokens: 0,
  };
  expect(parseRulings({ rulings: [ruling] }, ["strategy"])).toMatchObject({
    rulings: [{ gate: "strategy", verdict: "proven" }],
  });
  expect(parseRulings({ rulings: [ruling] }, ["code-quality"])).toMatchObject({
    refused: expect.stringContaining("strategy is not planned"),
  });
});

test("AC-6 (finding 150): a finding with line 0 is read as one with no line, for either severity, and the verdict is kept; other non-positive or non-number lines still refuse the ruling", () => {
  const planned: readonly JudgementGateName[] = ["code-quality", "test-quality"];
  const parsed = parseRulings(
    {
      rulings: [
        {
          gate: "code-quality",
          verdict: "not-proven",
          findings: [{ file: "src/a.ts", line: 0, text: "a defect", severity: "defect" }],
        },
        {
          gate: "test-quality",
          verdict: "proven",
          findings: [{ file: "spec.md", line: 0, text: "an advisory", severity: "advisory" }],
        },
      ],
    },
    planned,
  );
  if ("refused" in parsed) throw new Error(parsed.refused);
  const [code, tests] = parsed.rulings;
  expect(code?.verdict).toBe("not-proven");
  expect(code?.findings).toEqual([{ file: "src/a.ts", text: "a defect", severity: "defect" }]);
  expect(code?.findings[0] && "line" in code.findings[0]).toBe(false);
  expect(tests?.findings).toEqual([{ file: "spec.md", text: "an advisory", severity: "advisory" }]);
  // -0 is 0 once JSON has read it.
  const minus = parseRulings(
    JSON.parse(
      '{"rulings":[{"gate":"code-quality","verdict":"proven","findings":[{"file":"a","line":-0,"text":"x","severity":"advisory"}]}]}',
    ),
    planned,
  );
  expect("refused" in minus).toBe(false);
  const refused = (line: unknown) =>
    parseRulings(
      {
        rulings: [
          {
            gate: "code-quality",
            verdict: "proven",
            findings: [{ file: "src/a.ts", line, text: "x", severity: "advisory" }],
          },
        ],
      },
      planned,
    );
  for (const line of [-1, 1.5, Number.NaN, null, false, "0", "12"])
    expect(refused(line), String(line)).toEqual({
      refused: "finding 1 of code-quality: line is a positive integer",
    });
});
