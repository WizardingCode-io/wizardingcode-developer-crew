import { readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { reviewPatch } from "./fingerprint.ts";
import { nowIso, readJson, writeText } from "./fs.ts";
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

/**
 * A file the user sees: a component, a template, a stylesheet, or anything under resources/views/.
 * A test, a spec or a story of one is not one: nobody expects a UI review of a test file.
 */
export function isInterfacePath(rel: string): boolean {
  const lower = rel.toLowerCase();
  if (/(?:^|\/)__tests__\//.test(lower)) return false;
  const name = lower.slice(lower.lastIndexOf("/") + 1);
  if (/\.(?:test|spec|stories)\./.test(name)) return false;
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

/** What the review inputs describe: the fingerprint of the code the diff was cut from, and when. */
export interface ReviewInputs {
  fingerprint: string;
  at: string;
}

export function readReviewInputs(paths: CrewPaths, id: string): ReviewInputs | null {
  const raw = readJson<Partial<ReviewInputs>>(join(reviewDir(paths, id), "inputs.json"));
  return raw && typeof raw.fingerprint === "string" && typeof raw.at === "string"
    ? { fingerprint: raw.fingerprint, at: raw.at }
    : null;
}

/**
 * What a reviewer receives, and nothing else (SP2 §10, finding 20): the diff of the item's change
 * since its base commit, untracked files as additions, and the list of changed watched paths, with
 * `inputs.json` naming the fingerprint they describe. Plain files, rewritten at every gate run; the
 * session writes its findings and its ruling beside them. When the inputs are rewritten for other
 * code, the findings and the ruling written for the old code go with them: a ruling the judge gave
 * on code that no longer exists must not be recorded against the new (review of SP2b, finding 1).
 */
export function writeReviewInputs(
  paths: CrewPaths,
  work: WorkItem,
  changed: readonly string[],
  fingerprint: string,
): { dir: string; note: string | null } {
  const dir = reviewDir(paths, work.id);
  const previous = readReviewInputs(paths, work.id);
  if (previous && previous.fingerprint !== fingerprint) {
    let names: string[] = [];
    try {
      names = readdirSync(dir);
    } catch {
      names = [];
    }
    for (const name of names) {
      if (name === "ruling.json" || name.endsWith(".findings.md")) unlinkSync(join(dir, name));
    }
  }
  const cut = reviewPatch(paths.root, work.baseCommit, changed);
  writeText(join(dir, "diff.patch"), cut.patch);
  writeText(join(dir, "files.txt"), changed.length ? `${changed.join("\n")}\n` : "");
  writeText(
    join(dir, "inputs.json"),
    `${JSON.stringify({ fingerprint, at: nowIso() }, null, 2)}\n`,
  );
  return { dir, note: cut.note };
}

export type JudgementState = "planned" | "proven" | "not-proven" | "not-run" | "stale" | "skipped";
export interface JudgementRow {
  gate: JudgementGateName;
  status: JudgementState;
  /** Why the gate is planned for this item. */
  planned: string;
  findings: number;
  /** For not-run, the reviewer's reason; for skipped, the skip's; for stale, "ruling on earlier code". */
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
    // The reason the panel prints beside "stale" (review of SP2b, finding 13).
    if (record.fingerprint !== currentFingerprint)
      return {
        gate: p.gate,
        status: "stale",
        planned: p.reason,
        findings,
        reason: "ruling on earlier code",
      };
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
 * verdict stays the judge's). The item's own documents (`.crew/work/<id>/spec.md`, `plan.md`) are
 * part of the change: a risk finding on them is the item's, never debt.
 */
export function stampRuling(
  ruling: Ruling,
  fingerprint: string,
  changed: readonly string[],
  workId: string,
): JudgementRecord {
  const own = `.crew/work/${workId}/`;
  return {
    gate: ruling.gate,
    verdict: ruling.verdict,
    ...(ruling.reviewer ? { reviewer: ruling.reviewer } : {}),
    ...(ruling.judge ? { judge: ruling.judge } : {}),
    findings: ruling.findings.map((f) =>
      changed.includes(f.file) || f.file.startsWith(own) ? { ...f } : { ...f, outside: true },
    ),
    ...(ruling.tokens !== undefined ? { tokens: ruling.tokens } : {}),
    at: nowIso(),
    fingerprint,
  };
}

/**
 * A ruling the judge's own rule forbids: proven with a defect on a line of the change (judge.md:
 * "not-proven when at least one finding you uphold is a defect on a line of the diff"). The engine
 * never changes a verdict; it refuses to record a contradictory one, as it refuses "not proven
 * with no defect" (review of SP2b, finding 12). Null when the ruling is consistent.
 */
export function contradiction(record: JudgementRecord): string | null {
  if (record.verdict !== "proven") return null;
  const defect = record.findings.find((f) => f.severity === "defect" && !f.outside);
  if (!defect) return null;
  const where = defect.line ? `${defect.file}:${defect.line}` : defect.file;
  return `${record.gate}: proven with a defect on ${where}; the judge rules not proven on a defect inside the change, or lowers it to advisory`;
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
