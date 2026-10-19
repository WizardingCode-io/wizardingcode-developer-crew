/**
 * The audit report (SP7 §13.2, SP8 decision 8): the findings files parsed, every finding checked
 * for its proof and the rest left out by name, the verdict computed, the report rendered in
 * Markdown and in one inert HTML page under the brand. Every value shown is escaped and every log
 * line and finding text passes through the secrets scanner first.
 */
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import type { AuditRun, AuditRuns, AuditScope } from "./audit-run.ts";
import {
  AUDIT_SECTIONS,
  type AuditVerdictWord,
  type LeftOut,
  type ReportSignature,
} from "./audit-state.ts";
import type { Brand } from "./brand.ts";
import { readJson, readText } from "./fs.ts";
import { scanText } from "./secrets.ts";

export interface AuditFinding {
  id: string;
  severity: "defect" | "advisory";
  path: string | null;
  line: number | null;
  log: string | null;
  text: string;
}

export interface DependencyRow {
  package: string;
  current: string;
  latest: string;
  pros: string;
  cons: string;
  risk: string;
  proof: string;
}

export interface Recommendation {
  n: number;
  text: string;
  cost: "S" | "M" | "L";
  days: number;
  findings: string[];
}

export interface AuditReportInputs {
  id: string;
  project: string;
  date: string;
  summary: string;
  sections: Record<string, AuditFinding[]>;
  dependencies: DependencyRow[];
  runs: AuditRuns;
  scope: AuditScope;
  recommendations: Recommendation[];
  leftOut: LeftOut[];
  verdict: AuditVerdictWord;
  signed: ReportSignature | null;
  /** Rule 3 of SP7 §5: a remote test environment like production is recommended when the project declares none. */
  remoteEnvironmentNote: boolean;
  logs: { path: string; bytes: number; tail: string[] }[];
}

export const REPORT_HEADINGS: readonly string[] = [
  "Summary and verdict",
  "Scope and method",
  "Business issues",
  "Security issues",
  "Dependencies to update",
  "Architecture and code quality",
  "Tests",
  "Recommendations",
  "Appendix",
];

const REMOTE_ENVIRONMENT_LINE =
  "A remote test environment like production is recommended: the project declares none.";

const FINDING = /^- (F-\d+) · (defect|advisory) · (.+?) · (.+)$/;

/** The `## Findings` lines of a findings file in the reviewers' shape; other sections are not findings. */
export function parseFindingsFile(text: string): AuditFinding[] {
  const findings: AuditFinding[] = [];
  let inFindings = false;
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (line.startsWith("## ")) {
      inFindings = line === "## Findings";
      continue;
    }
    if (!inFindings) continue;
    const match = FINDING.exec(line);
    if (!match) continue;
    const [, id, severity, proof, body] = match as unknown as [
      string,
      string,
      string,
      string,
      string,
    ];
    const log = proof.startsWith("log:") ? proof.slice(4).trim() : null;
    const at = log === null ? /^(.+):(\d+)$/.exec(proof) : null;
    findings.push({
      id,
      severity: severity as AuditFinding["severity"],
      path: at ? (at[1] ?? null) : null,
      line: at ? Number(at[2]) : null,
      log,
      text: body.trim(),
    });
  }
  return findings;
}

function tableRows(text: string): string[][] {
  const rows: string[][] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("|")) continue;
    const cells = line
      .slice(1, line.endsWith("|") ? -1 : undefined)
      .split("|")
      .map((c) => c.trim());
    // The header and the separator are not rows.
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
    rows.push(cells);
  }
  return rows;
}

/** The researcher's table: `| Package | Current | Latest | Pros | Cons | Risk | Proof |`; a short row is skipped. */
export function parseDependenciesTable(text: string): DependencyRow[] {
  return tableRows(text)
    .filter((cells) => cells.length >= 7 && cells[0] !== "Package")
    .map((c) => ({
      package: c[0] ?? "",
      current: c[1] ?? "",
      latest: c[2] ?? "",
      pros: c[3] ?? "",
      cons: c[4] ?? "",
      risk: c[5] ?? "",
      proof: c[6] ?? "",
    }));
}

const COST_ORDER: Record<Recommendation["cost"], number> = { S: 0, M: 1, L: 2 };

/** The lead's table: `| # | Recommendation | Cost | Time | Findings |`, sorted by cost S, M, L then by days. */
export function parseRecommendations(text: string): Recommendation[] {
  const rows: Recommendation[] = [];
  for (const c of tableRows(text)) {
    if (c.length < 4 || c[0] === "#") continue;
    const n = Number(c[0]);
    const cost = c[2] as Recommendation["cost"];
    const days = Number(c[3]);
    if (!Number.isFinite(n) || !(cost in COST_ORDER) || !Number.isFinite(days)) continue;
    rows.push({
      n,
      text: c[1] ?? "",
      cost,
      days,
      findings: (c[4] ?? "")
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean),
    });
  }
  return rows.sort((a, b) => COST_ORDER[a.cost] - COST_ORDER[b.cost] || a.days - b.days);
}

function inside(base: string, path: string): boolean {
  const rel = relative(base, path);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/** The real path of `rel` under `base` when it exists and stays inside `base`'s real path; null otherwise. */
function realInside(base: string, rel: string): string | null {
  const candidate = join(base, rel);
  if (!existsSync(candidate)) return null;
  try {
    const real = realpathSync(candidate);
    return inside(realpathSync(base), real) ? real : "";
  } catch {
    return null;
  }
}

/**
 * The proof check: a finding keeps its place with a file under the root (its real path inside the
 * root's, no `..`, no symlink out) that has at least `line` lines, or a log whose real path is
 * inside the item's logs; everything else is left out, naming why.
 */
export function checkProof(
  findings: readonly AuditFinding[],
  root: string,
  logsDir: string,
  section: string,
): { kept: AuditFinding[]; leftOut: LeftOut[] } {
  const kept: AuditFinding[] = [];
  const leftOut: LeftOut[] = [];
  const out = (id: string, why: string) => leftOut.push({ section, id, why });
  for (const f of findings) {
    if (f.log !== null) {
      // A log names its path from the work folder (`logs/<name>`); it is checked against the logs folder.
      const under = f.log.startsWith("logs/") ? f.log.slice(5) : f.log;
      const real = realInside(logsDir, under);
      if (real === null) out(f.id, `no such log ${f.log}`);
      else if (real === "") out(f.id, `${f.log} is outside the item's logs`);
      else kept.push(f);
      continue;
    }
    if (f.path === null || f.line === null) {
      out(f.id, "no file and line, no log");
      continue;
    }
    const real = realInside(root, f.path);
    if (real === null) {
      out(
        f.id,
        f.path.split("/").includes("..")
          ? `${f.path} is outside the root`
          : `no such file ${f.path}`,
      );
      continue;
    }
    if (real === "") {
      out(f.id, `${f.path} is outside the root`);
      continue;
    }
    const text = readFileSync(real, "utf8");
    const lines = text.endsWith("\n") ? text.split("\n").length - 1 : text.split("\n").length;
    if (f.line > lines) {
      out(
        f.id,
        `line ${f.line} past the end of ${f.path} (${lines} line${lines === 1 ? "" : "s"})`,
      );
      continue;
    }
    kept.push(f);
  }
  return { kept, leftOut };
}

/** `critical` with a security defect or a secret found by the run, `attention` with any other defect, `sound` otherwise. */
export function auditVerdict(
  sections: Record<string, readonly AuditFinding[]>,
  secretsFound: boolean,
): AuditVerdictWord {
  if (secretsFound || (sections.security ?? []).some((f) => f.severity === "defect"))
    return "critical";
  for (const [name, findings] of Object.entries(sections))
    if (name !== "security" && findings.some((f) => f.severity === "defect")) return "attention";
  return "sound";
}

/** Every line the secrets scanner flags is replaced by `[redacted: <rule>]`. */
export function redactText(text: string): string {
  const flagged = new Map<number, string>();
  for (const f of scanText(text, "report")) if (!flagged.has(f.line)) flagged.set(f.line, f.rule);
  if (flagged.size === 0) return text;
  return text
    .split("\n")
    .map((line, i) => (flagged.has(i + 1) ? `[redacted: ${flagged.get(i + 1)}]` : line))
    .join("\n");
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** "Signed on <date> by the user, relayed by the agent", "Signed on <date> by the user", or "unsigned". */
export function signatureLine(signed: ReportSignature | null): string {
  if (!signed) return "unsigned";
  const who = signed.by === "user" ? "the user" : signed.by;
  return `Signed on ${signed.at.slice(0, 10)} by ${who}${signed.relayed ? ", relayed by the agent" : ""}`;
}

const VERDICT_TEXT: Record<AuditVerdictWord, string> = {
  critical: "a security defect or a secret found",
  attention: "a defect outside security",
  sound: "advisories alone",
};

function findingLine(f: AuditFinding, prefix = ""): string {
  const proof = f.log !== null ? `log:${f.log}` : `${f.path}:${f.line}`;
  return `- ${prefix}${f.id} · ${f.severity} · ${proof} · ${redactText(f.text)}`;
}

function runLine(r: AuditRun): string {
  const where = `${r.gate} (${r.target}${r.stack ? `, ${r.stack}` : ""})`;
  if (r.status === "unavailable") return `${where}: ${r.reason ?? "not run"}`;
  return `${where}: ${r.status}${r.status === "fail" && r.log ? ` (${r.log})` : ""}`;
}

function listOrNone(lines: string[]): string[] {
  return lines.length ? lines : ["- none"];
}

function sectionTitle(name: string): string {
  return name.replace("-", " ");
}

/** The report in Markdown: the nine sections in order, every text redacted. */
export function renderAuditMarkdown(inputs: AuditReportInputs): string {
  const lines: string[] = [];
  const findings = (name: string) => inputs.sections[name] ?? [];
  lines.push(`# Audit report: ${inputs.project}`, "");
  lines.push(`${inputs.date} · item ${inputs.id} · ${signatureLine(inputs.signed)}`, "");
  // 1. Summary and verdict
  lines.push("## Summary and verdict", "");
  lines.push(`Verdict: **${inputs.verdict}**: ${VERDICT_TEXT[inputs.verdict]}.`, "");
  lines.push(redactText(inputs.summary.trim()), "");
  lines.push("| Section | Defects | Advisories |", "| :- | -: | -: |");
  for (const name of AUDIT_SECTIONS) {
    const list = findings(name);
    lines.push(
      `| ${sectionTitle(name)} | ${list.filter((f) => f.severity === "defect").length} | ${list.filter((f) => f.severity === "advisory").length} |`,
    );
  }
  lines.push("");
  // 2. Scope and method
  lines.push("## Scope and method", "");
  const targets = inputs.scope.targets
    .map((t) => `${t.path} (${t.stack}${t.packageManager ? `, ${t.packageManager}` : ""})`)
    .join(", ");
  lines.push(
    `- Targets: ${targets || "none"}; files ${inputs.scope.files} (${inputs.scope.bytes} bytes); risk areas: ${inputs.scope.riskAreas.length ? inputs.scope.riskAreas.join(", ") : "none"}.`,
  );
  const ran = inputs.runs.runs.filter((r) => r.status !== "unavailable");
  const missing = inputs.runs.runs.filter((r) => r.status === "unavailable");
  lines.push(`- Ran: ${ran.length ? ran.map(runLine).join("; ") : "nothing"}.`);
  lines.push(`- Could not run: ${missing.length ? missing.map(runLine).join("; ") : "nothing"}.`);
  lines.push(
    "- Only read: the files listed in audit/files.txt, by the security, architecture, code quality and test quality reviewers and the researcher.",
  );
  lines.push(
    `- Findings left out for want of proof: ${inputs.leftOut.length ? inputs.leftOut.map((l) => `${l.section} ${l.id} (${l.why})`).join("; ") : "none"}.`,
  );
  if (inputs.remoteEnvironmentNote) lines.push(`- ${REMOTE_ENVIRONMENT_LINE}`);
  lines.push("");
  // 3. Business issues
  lines.push("## Business issues", "");
  lines.push(...listOrNone(findings("business").map((f) => findingLine(f))), "");
  // 4. Security issues
  lines.push("## Security issues", "");
  lines.push(...listOrNone(findings("security").map((f) => findingLine(f))));
  const secrets = inputs.runs.runs.find((r) => r.gate === "secrets");
  lines.push(
    `- Secrets scan: ${secrets ? (secrets.status === "unavailable" ? (secrets.reason ?? "not run") : `${secrets.status}${secrets.log ? ` (${secrets.log})` : ""}`) : "not run"}.`,
    "",
  );
  // 5. Dependencies to update
  lines.push("## Dependencies to update", "");
  const depsRun = inputs.runs.runs.find((r) => r.gate === "deps");
  const advisories = (depsRun?.advisories ?? []).map((a) => ({
    package: a,
    current: "",
    latest: "",
    pros: "",
    cons: "",
    risk: "advisory",
    proof: depsRun?.log ? `log: ${depsRun.log}` : "the deps run",
  }));
  const rows = [...inputs.dependencies, ...advisories];
  if (rows.length) {
    lines.push(
      "| Package | Current | Latest | Pros | Cons | Risk | Proof |",
      "| :- | :- | :- | :- | :- | :- | :- |",
    );
    for (const r of rows)
      lines.push(
        `| ${[r.package, r.current, r.latest, r.pros, r.cons, r.risk, r.proof].map((c) => redactText(c).replace(/\|/g, "\\|")).join(" | ")} |`,
      );
  } else lines.push("- none");
  lines.push("");
  // 6. Architecture and code quality
  lines.push("## Architecture and code quality", "");
  const quality = (["architecture", "code-quality", "data", "infra"] as const).flatMap((name) =>
    findings(name).map((f) => findingLine(f, `${name} `)),
  );
  lines.push(...listOrNone(quality));
  const debt = new Map<string, number>();
  for (const name of ["architecture", "code-quality", "data", "infra"])
    for (const f of findings(name))
      if (f.severity === "advisory" && f.path) debt.set(f.path, (debt.get(f.path) ?? 0) + 1);
  lines.push(
    `- Debt (advisories) per file: ${debt.size ? [...debt].map(([p, n]) => `${p} ${n}`).join(", ") : "none"}.`,
    "",
  );
  // 7. Tests
  lines.push("## Tests", "");
  const tests = inputs.runs.runs.filter((r) => r.gate === "test" || r.gate === "e2e");
  lines.push(...listOrNone(tests.map((r) => `- ${runLine(r)}`)));
  lines.push(...findings("test-quality").map((f) => findingLine(f)), "");
  // 8. Recommendations
  lines.push("## Recommendations", "");
  if (inputs.recommendations.length) {
    lines.push("| # | Recommendation | Cost | Time | Findings |", "| :- | :- | :- | :- | :- |");
    for (const r of inputs.recommendations)
      lines.push(
        `| ${r.n} | ${redactText(r.text).replace(/\|/g, "\\|")} | ${r.cost} | ${r.days} | ${r.findings.join(", ")} |`,
      );
  } else lines.push("- none");
  lines.push("");
  // 9. Appendix
  lines.push("## Appendix", "");
  if (inputs.logs.length === 0) lines.push("- no logs", "");
  for (const log of inputs.logs) {
    lines.push(`### ${log.path} (${log.bytes} bytes)`, "", "```");
    lines.push(...log.tail.map((l) => redactText(l).replace(/^```/, "'''")));
    lines.push("```", "");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

const STYLE = `
:root { color-scheme: light; }
body { font: 15px/1.5 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #1b1b1f; margin: 0; background: #fff; }
header, main, footer { max-width: 900px; margin: 0 auto; padding: 24px 32px; }
header { border-bottom: 2px solid #1b1b1f; }
header .brand svg { height: 40px; width: auto; }
header .missing { font-size: 12px; color: #777; }
h1 { font-size: 26px; margin: 16px 0 4px; }
h2 { font-size: 20px; margin: 32px 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; page-break-after: avoid; }
h3 { font-size: 15px; margin: 20px 0 4px; }
.meta { color: #555; margin: 0; }
table { border-collapse: collapse; margin: 8px 0; width: 100%; font-size: 14px; }
th, td { border: 1px solid #ccc; padding: 4px 8px; text-align: left; vertical-align: top; }
th { background: #f3f3f5; }
pre { background: #f6f6f8; border: 1px solid #e3e3e8; padding: 8px 12px; overflow-x: auto; font-size: 12px; white-space: pre-wrap; }
ul { padding-left: 20px; }
footer { font-size: 12px; color: #777; display: flex; align-items: center; gap: 8px; }
footer svg { height: 18px; width: auto; }
@media print { h2 { page-break-after: avoid; } pre, table { page-break-inside: avoid; } }
`;

function inline(text: string): string {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

/** The Markdown the engine writes (headings, lists, tables, fences, paragraphs) as escaped HTML. */
function markdownToHtml(md: string): string {
  const out: string[] = [];
  let list = false;
  let table: string[][] | null = null;
  let fence: string[] | null = null;
  const closeList = () => {
    if (list) out.push("</ul>");
    list = false;
  };
  const closeTable = () => {
    if (!table) return;
    const [head, ...body] = table;
    out.push("<table>");
    if (head) out.push(`<tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr>`);
    for (const row of body)
      out.push(`<tr>${row.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`);
    out.push("</table>");
    table = null;
  };
  for (const line of md.split("\n")) {
    if (fence) {
      if (line === "```") {
        out.push(`<pre>${fence.map(escapeHtml).join("\n")}</pre>`);
        fence = null;
      } else fence.push(line);
      continue;
    }
    if (line === "```") {
      closeList();
      closeTable();
      fence = [];
      continue;
    }
    if (line.startsWith("|")) {
      closeList();
      const cells = line
        .slice(1, line.endsWith("|") ? -1 : undefined)
        .split(/(?<!\\)\|/)
        .map((c) => c.trim().replace(/\\\|/g, "|"));
      if (!cells.every((c) => /^:?-+:?$/.test(c))) {
        if (!table) table = [];
        table.push(cells);
      }
      continue;
    }
    closeTable();
    const heading = /^(#{1,3}) (.+)$/.exec(line);
    if (heading) {
      closeList();
      const level = heading[1]?.length ?? 1;
      // The title line is the header's; the sections start at h2.
      if (level > 1) out.push(`<h${level}>${inline(heading[2] ?? "")}</h${level}>`);
      continue;
    }
    if (line.startsWith("- ")) {
      if (!list) out.push("<ul>");
      list = true;
      out.push(`<li>${inline(line.slice(2))}</li>`);
      continue;
    }
    closeList();
    if (line.trim() === "") continue;
    out.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  closeTable();
  return out.join("\n");
}

/** One self-contained page: the lockup and the mark inlined, every value escaped, nothing loaded. */
export function renderAuditHtml(inputs: AuditReportInputs, brand: Brand | null): string {
  const md = renderAuditMarkdown(inputs);
  // The title, its blank line and the meta line are the header's; the body starts at the first section.
  const body = md.split("\n").slice(3).join("\n");
  const title = `Audit report: ${inputs.project}`;
  const lockup = brand ? brand.lockup : '<span class="missing">brand assets not found</span>';
  const mark = brand ? brand.mark : "";
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title>`,
    `<style>${STYLE}</style>`,
    "</head>",
    "<body>",
    "<header>",
    `<div class="brand">${lockup}</div>`,
    `<h1>${escapeHtml(title)}</h1>`,
    `<p class="meta">${escapeHtml(inputs.date)} · item ${escapeHtml(inputs.id)} · ${escapeHtml(signatureLine(inputs.signed))}</p>`,
    "</header>",
    "<main>",
    markdownToHtml(body),
    "</main>",
    `<footer>${mark}<span>WizardingCode Developer Crew · ${escapeHtml(signatureLine(inputs.signed))}</span></footer>`,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

const TAIL_LINES = 20;

export interface AssembleOptions {
  auditDir: string;
  logsDir: string;
  root: string;
  id: string;
  project: string;
  date: string;
  signed: ReportSignature | null;
  remoteEnvironmentNote: boolean;
}

/**
 * The report's inputs from the audit folder: the runs and the scope, the lead's summary (required),
 * every findings file parsed and proof-checked, the dependencies, the recommendations, the logs'
 * tails; or the refusal that names what comes first.
 */
export function assembleAuditReport(
  options: AssembleOptions,
):
  | { inputs: AuditReportInputs; counts: Record<string, { defects: number; advisories: number }> }
  | { refused: string } {
  const { auditDir, logsDir, root, id } = options;
  const runs = readJson<AuditRuns>(join(auditDir, "runs.json"));
  if (!runs) return { refused: `the audit run comes first (crew audit ${id} run)` };
  const summary = readText(join(auditDir, "summary.md"));
  if (summary === null)
    return {
      refused: "the lead's summary comes before the report: audit/summary.md (references/audit.md)",
    };
  const scope = readJson<AuditScope>(join(auditDir, "scope.json")) ?? {
    targets: [],
    files: 0,
    bytes: 0,
    riskAreas: [],
  };
  const sections: Record<string, AuditFinding[]> = {};
  const counts: Record<string, { defects: number; advisories: number }> = {};
  const leftOut: LeftOut[] = [];
  for (const section of AUDIT_SECTIONS) {
    const text = readText(join(auditDir, `${section}.findings.md`));
    const parsed = text === null ? [] : parseFindingsFile(text);
    const checked = checkProof(parsed, root, logsDir, section);
    sections[section] = checked.kept;
    leftOut.push(...checked.leftOut);
    counts[section] = {
      defects: checked.kept.filter((f) => f.severity === "defect").length,
      advisories: checked.kept.filter((f) => f.severity === "advisory").length,
    };
  }
  const logs = runs.runs
    .filter((r): r is AuditRun & { log: string } => r.log !== null)
    .map((r) => {
      const file = join(logsDir, r.log.startsWith("logs/") ? r.log.slice(5) : r.log);
      let bytes = 0;
      let tail: string[] = [];
      try {
        bytes = statSync(file).size;
        const lines = readFileSync(file, "utf8").split("\n");
        if (lines.at(-1) === "") lines.pop();
        tail = lines.slice(-TAIL_LINES);
      } catch {
        tail = ["(log not readable)"];
      }
      return { path: r.log, bytes, tail };
    });
  const secretsFound = runs.runs.some((r) => r.gate === "secrets" && r.status === "fail");
  const inputs: AuditReportInputs = {
    id,
    project: options.project,
    date: options.date,
    summary,
    sections,
    dependencies: parseDependenciesTable(
      readText(join(auditDir, "dependencies.findings.md")) ?? "",
    ),
    runs,
    scope,
    recommendations: parseRecommendations(readText(join(auditDir, "recommendations.md")) ?? ""),
    leftOut,
    verdict: auditVerdict(sections, secretsFound),
    signed: options.signed,
    remoteEnvironmentNote: options.remoteEnvironmentNote,
    logs,
  };
  return { inputs, counts };
}
