import { join } from "node:path";
import { gitDiffSince } from "./fingerprint.ts";
import { nowIso, writeText } from "./fs.ts";
import { type CrewPaths, workDir } from "./paths.ts";
import type {
  Evidence,
  JudgementFinding,
  JudgementGateName,
  JudgementRecord,
  PlannedJudgement,
  Policy,
  RiskArea,
  Route,
  WorkItem,
} from "./types.ts";
import { isJudgementGateName, JUDGEMENT_GATES } from "./types.ts";
import { isSkipped } from "./work.ts";

const INTERFACE_EXTENSIONS = [
  ".vue",
  ".svelte",
  ".tsx",
  ".jsx",
  ".astro",
  ".blade.php",
  ".html",
  ".css",
  ".scss",
  ".less",
];

/** A file the user sees: a component, a template, a stylesheet, or anything under resources/views/. */
export function isInterfacePath(rel: string): boolean {
  const lower = rel.toLowerCase();
  if (/(?:^|\/)resources\/views\//.test(lower)) return true;
  return INTERFACE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * The judgement gates an item needs, from the route, the risk areas and the diff (SP2 §10): code and
 * test quality on standard and full; security on full, or on standard when a risk area is touched;
 * UI/UX on any route when the change touches an interface file; risk on full; and whatever the team
 * policy requires. A fast item with no interface file plans none, so the fast route costs nothing more.
 */
export function plannedJudgementGates(
  route: Route,
  riskAreas: readonly RiskArea[],
  changed: readonly string[],
  policy: Policy,
): PlannedJudgement[] {
  const planned: PlannedJudgement[] = [];
  const plan = (gate: JudgementGateName, reason: string): void => {
    if (!planned.some((p) => p.gate === gate)) planned.push({ gate, reason });
  };
  if (route !== "fast") {
    plan("code-quality", `${route} route`);
    plan("test-quality", `${route} route`);
  }
  if (route === "full") plan("security", "full route");
  else if (route === "standard" && riskAreas.length)
    plan("security", `risk area${riskAreas.length === 1 ? "" : "s"} ${riskAreas.join(", ")}`);
  const interfaces = changed.filter(isInterfacePath);
  if (interfaces.length) {
    const shown = interfaces.slice(0, 3).join(", ");
    const more = interfaces.length > 3 ? `, +${interfaces.length - 3} more` : "";
    plan("ui-ux", `interface files: ${shown}${more}`);
  }
  if (route === "full") plan("risk", "full route");
  for (const gate of policy.judgementGates) plan(gate, "policy");
  return planned;
}

/** Where the review of an item lives: the engine's inputs, and the roles' answers the session saves beside them. Not engine-owned. */
export function reviewDir(paths: CrewPaths, id: string): string {
  return join(workDir(paths, id), "review");
}

/**
 * What a reviewer receives, and nothing else (SP2 §10, finding 20): the diff of the item's change
 * since its base commit, untracked files as additions, and the list of changed watched paths.
 * Plain files, rewritten at every gate run; the session writes its rulings beside them.
 */
export function writeReviewInputs(
  paths: CrewPaths,
  work: WorkItem,
  changed: readonly string[],
): string {
  const dir = reviewDir(paths, work.id);
  const patch = work.baseCommit ? gitDiffSince(paths.root, work.baseCommit, changed) : "";
  writeText(join(dir, "diff.patch"), patch);
  writeText(join(dir, "files.txt"), changed.length ? `${changed.join("\n")}\n` : "");
  return dir;
}

export type JudgementState = "planned" | "proven" | "not-proven" | "not-run" | "stale" | "skipped";
export interface JudgementRow {
  gate: JudgementGateName;
  status: JudgementState;
  /** Why the gate is planned for this item. */
  planned: string;
  findings: number;
  /** For not-run, the reviewer's reason; for skipped, the skip's. */
  reason?: string;
}

/** One row per planned judgement gate, as the status and the panel show them; derived, never stored. */
export function judgementRows(
  work: WorkItem,
  evidence: Evidence,
  planned: readonly PlannedJudgement[],
  currentFingerprint: string,
  policy: Policy,
): JudgementRow[] {
  return planned.map((p) => {
    const record = (evidence.judgement ?? []).find((j) => j.gate === p.gate);
    const findings = record?.findings.length ?? 0;
    if (isSkipped(work, `gate:${p.gate}`, policy)) {
      const skip = work.skips.find((s) => s.step === `gate:${p.gate}`);
      return {
        gate: p.gate,
        status: "skipped",
        planned: p.reason,
        findings,
        ...(skip?.reason ? { reason: skip.reason } : {}),
      };
    }
    if (!record) return { gate: p.gate, status: "planned", planned: p.reason, findings: 0 };
    if (record.fingerprint !== currentFingerprint)
      return { gate: p.gate, status: "stale", planned: p.reason, findings };
    return {
      gate: p.gate,
      status: record.verdict,
      planned: p.reason,
      findings,
      ...(record.reason ? { reason: record.reason } : {}),
    };
  });
}

type Raw = Record<string, unknown>;
function isRecord(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A ruling as a review file states it: the judge's verdict on a planned gate, with the reviewer's findings. */
export interface Ruling {
  gate: JudgementGateName;
  verdict: "proven" | "not-proven";
  reviewer?: string;
  judge?: string;
  findings: Omit<JudgementFinding, "outside">[];
  tokens?: number;
}

/** " (planned: a, b)" or " (none is planned)", for a refusal that names a gate the item does not need. */
export function plannedNote(planned: readonly JudgementGateName[]): string {
  return planned.length ? ` (planned: ${planned.join(", ")})` : " (none is planned)";
}

/**
 * The rulings of a review file, checked before anything is recorded: every gate known and planned
 * for this item, every verdict one the judge may give, every finding tied to a file with a text,
 * and no "not proven" without a defect to show for it (SP2 §10: the judge rules on findings, so a
 * reviewer's volume never becomes a verdict and a bare "no" never does either).
 */
export function parseRulings(
  raw: unknown,
  planned: readonly JudgementGateName[],
): { rulings: Ruling[] } | { refused: string } {
  if (!isRecord(raw) || !Array.isArray(raw.rulings))
    return { refused: 'the ruling file is a JSON object with a "rulings" list' };
  if (raw.rulings.length === 0) return { refused: "the ruling file has no rulings" };
  const rulings: Ruling[] = [];
  for (const [index, entry] of raw.rulings.entries()) {
    const where = `ruling ${index + 1}`;
    if (!isRecord(entry)) return { refused: `${where}: not an object` };
    const gate = entry.gate;
    if (!isJudgementGateName(gate))
      return {
        refused: `${where}: unknown judgement gate: ${String(gate)} (${JUDGEMENT_GATES.join(", ")})`,
      };
    if (!planned.includes(gate))
      return { refused: `${where}: ${gate} is not planned for this item${plannedNote(planned)}` };
    const verdict = entry.verdict;
    if (verdict !== "proven" && verdict !== "not-proven")
      return {
        refused: `${where} (${gate}): verdict is proven or not-proven, not ${String(verdict)}; a gate that could not run is recorded with crew judgement <id> record ${gate} --not-run --reason "<why>"`,
      };
    const rawFindings = entry.findings ?? [];
    if (!Array.isArray(rawFindings)) return { refused: `${where} (${gate}): findings is a list` };
    const findings: Ruling["findings"] = [];
    for (const [n, f] of rawFindings.entries()) {
      const at = `finding ${n + 1} of ${gate}`;
      if (!isRecord(f)) return { refused: `${at}: not an object` };
      if (typeof f.file !== "string" || !f.file.trim()) return { refused: `${at}: needs a file` };
      if (typeof f.text !== "string" || !f.text.trim()) return { refused: `${at}: needs a text` };
      if (f.severity !== "defect" && f.severity !== "advisory")
        return { refused: `${at}: severity is defect or advisory` };
      const line = f.line;
      if (line !== undefined && !(typeof line === "number" && Number.isInteger(line) && line > 0))
        return { refused: `${at}: line is a positive integer` };
      findings.push({
        file: f.file.trim().replace(/^\.\//, ""),
        ...(typeof line === "number" ? { line } : {}),
        text: f.text.trim(),
        severity: f.severity,
      });
    }
    if (verdict === "not-proven" && !findings.some((f) => f.severity === "defect"))
      return {
        refused: `${where} (${gate}): not proven with no defect finding; the judge rules not proven on defects, or rules proven`,
      };
    const tokens = entry.tokens;
    if (
      tokens !== undefined &&
      !(typeof tokens === "number" && Number.isFinite(tokens) && tokens >= 0)
    )
      return { refused: `${where} (${gate}): tokens is a number` };
    if (rulings.some((r) => r.gate === gate))
      return { refused: `two rulings for ${gate} in one file` };
    rulings.push({
      gate,
      verdict,
      ...(typeof entry.reviewer === "string" ? { reviewer: entry.reviewer } : {}),
      ...(typeof entry.judge === "string" ? { judge: entry.judge } : {}),
      findings,
      ...(typeof tokens === "number" ? { tokens } : {}),
    });
  }
  return { rulings };
}

/**
 * The record the engine keeps: the ruling as given, stamped with when and on which code, each
 * finding on a file outside the change marked (ADR 0006: debt is reported, not failed on; the
 * verdict stays the judge's).
 */
export function stampRuling(
  ruling: Ruling,
  fingerprint: string,
  changed: readonly string[],
): JudgementRecord {
  return {
    gate: ruling.gate,
    verdict: ruling.verdict,
    ...(ruling.reviewer ? { reviewer: ruling.reviewer } : {}),
    ...(ruling.judge ? { judge: ruling.judge } : {}),
    findings: ruling.findings.map((f) =>
      changed.includes(f.file) ? { ...f } : { ...f, outside: true },
    ),
    ...(ruling.tokens !== undefined ? { tokens: ruling.tokens } : {}),
    at: nowIso(),
    fingerprint,
  };
}

/** A gate that could not run: not run, with the reason, never passed by default (SP2 §10). */
export function notRunRecord(
  gate: JudgementGateName,
  reason: string,
  fingerprint: string,
): JudgementRecord {
  return {
    gate,
    verdict: "not-run",
    reason: reason.trim(),
    findings: [],
    at: nowIso(),
    fingerprint,
  };
}

/** A later ruling on a gate supersedes the earlier one, as a later gate run does. */
export function recordJudgement(evidence: Evidence, record: JudgementRecord): void {
  evidence.judgement = [
    ...(evidence.judgement ?? []).filter((j) => j.gate !== record.gate),
    record,
  ];
}
