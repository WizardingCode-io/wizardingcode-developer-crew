import { expect, test } from "bun:test";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type AuditFinding,
  type AuditReportInputs,
  auditVerdict,
  checkProof,
  parseDependenciesTable,
  parseFindingsFile,
  parseRecommendations,
  REPORT_HEADINGS,
  redactText,
  renderAuditHtml,
  renderAuditMarkdown,
  signatureLine,
} from "../src/audit-report.ts";
import type { AuditRuns, AuditScope } from "../src/audit-run.ts";
import { PLANTED_KEY } from "./audit-run.test.ts";
import { tempDir } from "./helpers.ts";

const FINDINGS = `# security findings for w1
reviewer: review-security
read: 3 files

## Findings
- F-1 · defect · src/a.ts:2 · A caller reads the key.
- F-2 · advisory · log:logs/audit-test-root.txt · The test fails on login.
- F-3 · defect · nope · No proof form at all.
- not a finding line
(or: none)

## Outside the change
- src/z.ts:1 · ignored: another section
`;

const RUNS: AuditRuns = {
  at: "2026-10-19T10:00:00.000Z",
  head: "abcdef1234567890",
  runs: [
    {
      gate: "secrets",
      target: ".",
      status: "fail",
      durationMs: 3,
      log: "logs/audit-secrets-root.txt",
    },
    {
      gate: "build",
      target: ".",
      status: "pass",
      durationMs: 10,
      log: "logs/audit-build-root.txt",
    },
    { gate: "test", target: ".", status: "fail", durationMs: 20, log: "logs/audit-test-root.txt" },
    {
      gate: "deps",
      target: ".",
      status: "unavailable",
      durationMs: 0,
      log: null,
      reason: "no lockfile",
    },
    {
      gate: "e2e",
      target: ".",
      status: "unavailable",
      durationMs: 0,
      log: null,
      reason: "needs the environment; run by hand",
    },
  ],
};
const SCOPE: AuditScope = {
  targets: [{ path: ".", stack: "node", packageManager: "npm" }],
  files: 4,
  bytes: 120,
  riskAreas: ["data-migration"],
};

function finding(over: Partial<AuditFinding>): AuditFinding {
  return { id: "F-1", severity: "advisory", path: null, line: null, log: null, text: "x", ...over };
}

function inputs(over: Partial<AuditReportInputs> = {}): AuditReportInputs {
  return {
    id: "w1",
    project: "Shop <Ltd>",
    date: "2026-10-19",
    summary: "The shop is sound but leaks a key.",
    sections: {
      business: [],
      security: [
        finding({
          id: "F-1",
          severity: "defect",
          path: "src/a.ts",
          line: 2,
          text: "A caller reads the key.",
        }),
      ],
      architecture: [],
      "code-quality": [
        finding({
          id: "F-1",
          path: "src/a.ts",
          line: 1,
          text: 'Says <script>alert("x")</script> and <img onerror=x>.',
        }),
      ],
      "test-quality": [],
      data: [],
      infra: [],
    },
    dependencies: [
      {
        package: "left-pad",
        current: "1.0.0",
        latest: "1.3.0",
        pros: "fixes",
        cons: "none",
        risk: "low",
        proof: "https://example.test/left-pad",
      },
    ],
    runs: RUNS,
    scope: SCOPE,
    recommendations: [{ n: 1, text: "Rotate the key", cost: "S", days: 1, findings: ["F-1"] }],
    leftOut: [{ section: "security", id: "F-3", why: "no file and line, no log" }],
    verdict: "critical",
    signed: null,
    remoteEnvironmentNote: true,
    logs: [
      { path: "logs/audit-test-root.txt", bytes: 120, tail: ["1 fail", `aws = "${PLANTED_KEY}"`] },
    ],
    ...over,
  };
}

test("SP8-T5 AC-1: the findings files, the dependencies table and the recommendations parse into their shapes, the recommendations sorted S, M, L then by days", () => {
  expect(parseFindingsFile(FINDINGS)).toEqual([
    {
      id: "F-1",
      severity: "defect",
      path: "src/a.ts",
      line: 2,
      log: null,
      text: "A caller reads the key.",
    },
    {
      id: "F-2",
      severity: "advisory",
      path: null,
      line: null,
      log: "logs/audit-test-root.txt",
      text: "The test fails on login.",
    },
    {
      id: "F-3",
      severity: "defect",
      path: null,
      line: null,
      log: null,
      text: "No proof form at all.",
    },
  ]);
  expect(parseFindingsFile("# x\n## Findings\n- none\n")).toEqual([]);
  const table = `# Dependencies for w1
| Package | Current | Latest | Pros | Cons | Risk | Proof |
| :- | :- | :- | :- | :- | :- | :- |
| left-pad | 1.0.0 | 1.3.0 | fixes | none | low | https://example.test/left-pad |
| short | row |
`;
  expect(parseDependenciesTable(table)).toEqual([
    {
      package: "left-pad",
      current: "1.0.0",
      latest: "1.3.0",
      pros: "fixes",
      cons: "none",
      risk: "low",
      proof: "https://example.test/left-pad",
    },
  ]);
  const recommendations = `| # | Recommendation | Cost | Time | Findings |
| :- | :- | :- | :- | :- |
| 1 | Split the module | L | 10 | F-4 |
| 2 | Rotate the key | S | 1 | F-1, F-3 |
| 3 | Pin the dependency | M | 2 | |
| 4 | Add a test | S | 0.5 | F-2 |
| 5 | Bad cost | X | 1 | F-1 |
`;
  expect(
    parseRecommendations(recommendations).map((r) => [r.n, r.cost, r.days, r.findings]),
  ).toEqual([
    [4, "S", 0.5, ["F-2"]],
    [2, "S", 1, ["F-1", "F-3"]],
    [3, "M", 2, []],
    [1, "L", 10, ["F-4"]],
  ]);
});

test("SP8-T5 AC-1: a finding keeps its place only with a file and line that exist inside the root, or a log inside the item's logs; the rest is left out naming why", () => {
  const root = tempDir("crew-audit-root-");
  const outside = tempDir("crew-audit-outside-");
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "a.ts"), "a\nb\nc\n");
  writeFileSync(join(outside, "evil.ts"), "x\n");
  symlinkSync(outside, join(root, "link"));
  const work = tempDir("crew-audit-work-");
  const logs = join(work, "logs");
  mkdirSync(logs);
  writeFileSync(join(logs, "audit-test-root.txt"), "fail\n");
  writeFileSync(join(work, "work.json"), "{}\n");
  symlinkSync(join(outside, "evil.ts"), join(logs, "out.txt"));
  const result = checkProof(
    [
      finding({ id: "F-1", path: "src/a.ts", line: 3 }),
      finding({ id: "F-2", path: "src/a.ts", line: 4 }),
      finding({ id: "F-3", path: "../evil.ts", line: 1 }),
      finding({ id: "F-4", path: "link/evil.ts", line: 1 }),
      finding({ id: "F-5", path: "src/nope.ts", line: 1 }),
      finding({ id: "F-6", log: "logs/audit-test-root.txt" }),
      finding({ id: "F-7", log: "logs/../work.json" }),
      finding({ id: "F-8", log: "logs/out.txt" }),
      finding({ id: "F-9", log: "logs/missing.txt" }),
      finding({ id: "F-10" }),
    ],
    root,
    logs,
    "security",
  );
  expect(result.kept.map((f) => f.id)).toEqual(["F-1", "F-6"]);
  expect(result.leftOut).toEqual([
    { section: "security", id: "F-2", why: "line 4 past the end of src/a.ts (3 lines)" },
    { section: "security", id: "F-3", why: "../evil.ts is outside the root" },
    { section: "security", id: "F-4", why: "link/evil.ts is outside the root" },
    { section: "security", id: "F-5", why: "no such file src/nope.ts" },
    { section: "security", id: "F-7", why: "logs/../work.json is outside the item's logs" },
    { section: "security", id: "F-8", why: "logs/out.txt is outside the item's logs" },
    { section: "security", id: "F-9", why: "no such log logs/missing.txt" },
    { section: "security", id: "F-10", why: "no file and line, no log" },
  ]);
});

test("SP8-T5 AC-1: the verdict is critical with a security defect or a secret found, attention with another defect, sound with advisories alone", () => {
  const defect = finding({ severity: "defect", path: "a", line: 1 });
  const advisory = finding({ severity: "advisory", path: "a", line: 1 });
  expect(auditVerdict({ security: [defect], business: [] }, false)).toBe("critical");
  expect(auditVerdict({ security: [advisory], business: [advisory] }, true)).toBe("critical");
  expect(auditVerdict({ security: [advisory], business: [defect] }, false)).toBe("attention");
  expect(auditVerdict({ security: [advisory], "code-quality": [advisory] }, false)).toBe("sound");
  expect(auditVerdict({}, false)).toBe("sound");
});

test("SP8-T5 AC-2: the Markdown has the nine headings in order, names what was left out, rule 3's line and the signature, and no secret value survives the redaction", () => {
  const md = renderAuditMarkdown(inputs());
  const at = REPORT_HEADINGS.map((h) => md.indexOf(`## ${h}`));
  expect(at.every((i) => i >= 0)).toBe(true);
  expect([...at].sort((a, b) => a - b)).toEqual(at);
  expect(md).toContain("# Audit report: Shop <Ltd>");
  expect(md).toContain("Verdict: **critical**");
  expect(md).toContain("left out for want of proof: security F-3 (no file and line, no log)");
  expect(md).toContain(
    "A remote test environment like production is recommended: the project declares none.",
  );
  expect(md).toContain("unsigned");
  expect(md).toContain("- F-1 · defect · src/a.ts:2 · A caller reads the key.");
  expect(md).toContain("| left-pad | 1.0.0 | 1.3.0 |");
  expect(md).toContain("| 1 | Rotate the key | S | 1 | F-1 |");
  expect(md).toContain("test (.): fail (logs/audit-test-root.txt)");
  expect(md).toContain("### logs/audit-test-root.txt (120 bytes)");
  expect(md).not.toContain(PLANTED_KEY);
  expect(md).toContain("[redacted: AWS access key]");
  expect(renderAuditMarkdown(inputs({ remoteEnvironmentNote: false }))).not.toContain(
    "A remote test environment like production",
  );
  const signed = renderAuditMarkdown(
    inputs({ signed: { at: "2026-10-19T12:00:00.000Z", by: "user", relayed: true } }),
  );
  expect(signed).toContain("Signed on 2026-10-19 by the user, relayed by the agent");
  expect(signatureLine({ at: "2026-10-19T12:00:00.000Z", by: "user", relayed: false })).toBe(
    "Signed on 2026-10-19 by the user",
  );
  expect(signatureLine(null)).toBe("unsigned");
  expect(redactText(`a\ntoken = "${PLANTED_KEY}"\nb`)).toBe("a\n[redacted: AWS access key]\nb");
});

test("SP8-T5 AC-2: the HTML is one inert page under the brand: the lockup inlined, every value escaped, no script, no link, nothing loaded; without the brand the header says so", () => {
  const brand = { dir: "/x", lockup: '<svg id="lockup"></svg>', mark: '<svg id="mark"></svg>' };
  const html = renderAuditHtml(inputs(), brand);
  expect(html).toContain('<svg id="lockup">');
  expect(html).toContain("Shop &lt;Ltd&gt;");
  expect(html).toContain("unsigned");
  expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  expect(html).toContain("&lt;img onerror=x&gt;");
  expect(html).not.toMatch(/<script|<link|<iframe|<object|<embed/i);
  expect(html).not.toMatch(/(?:src|href)\s*=\s*["']?(?:https?:|\/\/)/i);
  expect(html).not.toContain(PLANTED_KEY);
  expect(html).toContain("[redacted: AWS access key]");
  for (const h of REPORT_HEADINGS) expect(html).toContain(`<h2>${h}</h2>`);
  // The date, the item and the signature are the header's and the footer's: the body does not repeat them.
  expect(html.split("item w1 · unsigned").length - 1).toBe(1);
  expect(html).toContain("<style>");
  const bare = renderAuditHtml(inputs(), null);
  expect(bare).toContain("brand assets not found");
  expect(bare).not.toContain("<svg");
  expect(bare).toContain("Shop &lt;Ltd&gt;");
});
