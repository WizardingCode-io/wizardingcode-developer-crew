import { copyFileSync, existsSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { reviewPatch } from "./fingerprint.ts";
import { nowIso, readJson, sha256, writeText } from "./fs.ts";
import { type CrewPaths, workDir } from "./paths.ts";
import { isInterfacePath } from "./paths-kind.ts";
import { plannedSeats, taskSeats } from "./team.ts";
import type {
  Evidence,
  JudgementFinding,
  JudgementGateName,
  JudgementRecord,
  JudgementVerdict,
  PlannedJudgement,
  Policy,
  RiskArea,
  RoleRecord,
  Route,
  Seat,
  WorkItem,
} from "./types.ts";
import { isJudgementGateName, JUDGEMENT_GATES } from "./types.ts";
import { isSkipped } from "./work.ts";

// The interface-file reading lives in paths-kind.ts since SP7a (the registry asks it too); the name
// stays exported from here for its callers.
export { isInterfacePath };

/**
 * The judgement gates an item needs (SP2 §10), as a view of the seats the registry plans (SP7 §6.2):
 * the `gate` seats, in the order they are planned. A fast item with no interface file plans none, so
 * the fast route costs nothing more.
 */
export function plannedJudgementGates(
  route: Route,
  riskAreas: readonly RiskArea[],
  changed: readonly string[],
  policy: Policy,
): PlannedJudgement[] {
  return plannedSeats(route, riskAreas, changed, policy)
    .filter(
      (s): s is Seat & { gate: JudgementGateName } => s.kind === "gate" && s.gate !== undefined,
    )
    .map((s) => ({ gate: s.gate, reason: s.reason }));
}

/** Where the review of an item lives, or of one of its todos under `review/T-n` (SP7b decision 14): the engine's inputs, the roles' answers the hook files beside them and the round copies, all the engine's except `ui/` and `e2e/` (decision 16). */
export function reviewDir(paths: CrewPaths, id: string, task?: string): string {
  const dir = join(workDir(paths, id), "review");
  return task ? join(dir, task) : dir;
}

/**
 * The judgement gates a todo's files ask for (SP7b decision 14): the gate seats the registry plans
 * for the scope alone, as `{ gate, reason }`.
 */
export function plannedTaskJudgement(scope: readonly string[], policy: Policy): PlannedJudgement[] {
  return taskSeats(scope, policy).flatMap((s) =>
    s.kind === "gate" && s.gate ? [{ gate: s.gate, reason: s.reason }] : [],
  );
}

/** The word a record line gives a verdict: proven, not proven, not run (the item's and the todo's lines alike). */
export function verdictWord(verdict: JudgementVerdict): string {
  return verdict === "not-proven" ? "not proven" : verdict === "not-run" ? "not run" : "proven";
}

/** `n finding` or `n findings`, as every line that counts a ruling's findings says it. */
export function findingsText(n: number): string {
  return `${n} finding${n === 1 ? "" : "s"}`;
}

/** The hash of a scope as a set: sorted, deduplicated, one path per line. A todo's ruling carries it. */
export function scopeHash(scope: readonly string[]): string {
  return sha256([...new Set(scope)].sort().join("\n"));
}

/**
 * The round's files, kept by the engine at the record (SP7b decision 16, finding 70): each gate's
 * findings file as `<gate>.round<n>.md` when it exists, and the ruling file as `ruling.round<n>.json`,
 * in the review folder the record belongs to; an earlier copy of the same round is overwritten.
 */
export function keepRound(
  paths: CrewPaths,
  id: string,
  round: number,
  gates: readonly JudgementGateName[],
  rulingFile: string,
  task?: string,
): void {
  const dir = reviewDir(paths, id, task);
  for (const gate of gates) {
    const findings = join(dir, `${gate}.findings.md`);
    if (existsSync(findings)) copyFileSync(findings, join(dir, `${gate}.round${round}.md`));
  }
  if (existsSync(rulingFile)) copyFileSync(rulingFile, join(dir, `ruling.round${round}.json`));
}

/** One capture the session took under `review/ui/` (SP2 §10), with the console file saved beside it, or null without one (rule 5). */
export interface Capture {
  file: string;
  console: string | null;
}

/** What the review inputs describe: the fingerprint of the code the diff was cut from, when, and the captures. */
export interface ReviewInputs {
  fingerprint: string;
  at: string;
  captures: Capture[];
}

const CAPTURE = /\.(?:png|jpe?g)$/i;

/** The captures under `review/ui/` (or `review/T-n/ui/` for a todo), sorted by name, each with its `console-<name>.json` when the session saved one. */
export function listCaptures(paths: CrewPaths, id: string, task?: string): Capture[] {
  let names: string[];
  try {
    names = readdirSync(join(reviewDir(paths, id, task), "ui"));
  } catch {
    return [];
  }
  const prefix = task ? `review/${task}/ui/` : "review/ui/";
  return names
    .filter((name) => CAPTURE.test(name))
    .sort()
    .map((name) => {
      const consoleFile = `console-${name.replace(CAPTURE, "")}.json`;
      return {
        file: `${prefix}${name}`,
        console: names.includes(consoleFile) ? `${prefix}${consoleFile}` : null,
      };
    });
}

function isCapture(raw: unknown): raw is Capture {
  if (!raw || typeof raw !== "object") return false;
  const { file, console: consoleFile } = raw as Record<string, unknown>;
  return typeof file === "string" && (typeof consoleFile === "string" || consoleFile === null);
}

export function readReviewInputs(paths: CrewPaths, id: string, task?: string): ReviewInputs | null {
  const raw = readJson<Partial<ReviewInputs>>(join(reviewDir(paths, id, task), "inputs.json"));
  if (!raw || typeof raw.fingerprint !== "string" || typeof raw.at !== "string") return null;
  const captures = Array.isArray(raw.captures) ? raw.captures.filter(isCapture) : [];
  return { fingerprint: raw.fingerprint, at: raw.at, captures };
}

/**
 * What a reviewer receives, and nothing else (SP2 §10, finding 20): the diff of the item's change
 * since its base commit, untracked files as additions, and the list of changed watched paths, with
 * `inputs.json` naming the fingerprint they describe. Plain files, rewritten at every gate run; the
 * session writes its findings and its ruling beside them. When the inputs are rewritten for other
 * code, the findings and the ruling written for the old code go with them: a ruling the judge gave
 * on code that no longer exists must not be recorded against the new (review of SP2b, finding 1).
 * The captures under `review/ui/` are listed with their console files, so the UI/UX reviewer and
 * the gate run can say which page has no console measurement (SP7 §8.3).
 */
export function writeReviewInputs(
  paths: CrewPaths,
  work: WorkItem,
  changed: readonly string[],
  fingerprint: string,
  task?: string,
): { dir: string; note: string | null } {
  const dir = reviewDir(paths, work.id, task);
  const previous = readReviewInputs(paths, work.id, task);
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
    `${JSON.stringify({ fingerprint, at: nowIso(), captures: listCaptures(paths, work.id, task) }, null, 2)}\n`,
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
  subject = "this item",
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
      return { refused: `${where}: ${gate} is not planned for ${subject}${plannedNote(planned)}` };
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
 * The engine's own count of what the roles spent, for a ruling the session left at 0 (SP2c §14):
 * the gate's reviewer (its latest record read from a transcript) plus the judge's share across the
 * rulings recorded together that the judge ruled (a not-run gate takes none, and a number the
 * session gave stands but still counts as one of the judge's rulings). Only the records of this
 * round count: those at or after `since`, the moment the gate run cut the diff the judge saw; an
 * earlier round's record never stands in for a role that did not go through the hook, and with no
 * cut known nothing does. Without a record the tokens stay at 0.
 */
export function fillTokens(records: JudgementRecord[], roles: RoleRecord[], since?: string): void {
  const thisRound = since ? roles.filter((r) => r.at >= since) : [];
  const latest = (agent: string) =>
    [...thisRound].reverse().find((r) => r.agent === agent && r.tokensFrom === "transcript");
  const judge = latest("judge");
  const ruled = records.filter((r) => r.verdict !== "not-run");
  for (const record of ruled) {
    if ((record.tokens ?? 0) !== 0) continue;
    const reviewer = latest(`review-${record.gate}`);
    if (reviewer || judge)
      record.tokens = (reviewer?.tokens ?? 0) + Math.round((judge?.tokens ?? 0) / ruled.length);
  }
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
