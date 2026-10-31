import { createHash } from "node:crypto";

/**
 * The document reviewed before the code (ADR 0019): the stages, the rounds and what closes them,
 * as pure functions over the record `crew spec-review` keeps in the evidence. The roles are
 * launched by the session; nothing here launches, reads a file or decides who is present.
 */

type SpecRange = "both" | "feature" | "detailed";

export interface SpecStage {
  stage: number;
  name: string;
  reviewers: readonly string[];
  range: SpecRange;
  standards: readonly string[];
}

export const STAGES: readonly SpecStage[] = [
  {
    stage: 5,
    name: "zoom out",
    reviewers: ["goldfish-zoom-out"],
    range: "both",
    standards: ["spec-zoom-out"],
  },
  {
    stage: 6,
    name: "comprehension",
    reviewers: ["goldfish-comprehension"],
    range: "both",
    standards: [],
  },
  {
    stage: 7,
    name: "critic",
    reviewers: ["goldfish-design", "goldfish-structural", "goldfish-style"],
    range: "feature",
    standards: ["spec-feature", "spec-heilmeier"],
  },
  {
    stage: 8,
    name: "second zoom out",
    reviewers: ["goldfish-zoom-out"],
    range: "both",
    standards: ["spec-zoom-out"],
  },
  {
    stage: 9,
    name: "readiness",
    reviewers: ["goldfish-readiness", "goldfish-codebase", "goldfish-style"],
    range: "detailed",
    standards: ["spec-readiness", "spec-reimplementation"],
  },
];

/** Rounds before a person chooses whether to go on (the source's cap). */
const MAX_SPEC_ROUNDS = 5;

export type SpecSeverity = "Blocker" | "Major" | "Nit";
export type SpecDisposition = "propose-fix" | "contest" | "escalate" | "decline" | "settled";
export const SPEC_DISPOSITIONS: readonly SpecDisposition[] = [
  "propose-fix",
  "contest",
  "escalate",
  "decline",
  "settled",
];
export type SpecAnswerChoice = "confirm" | "add-fact";

export interface SpecFinding {
  id: string;
  reviewer: string;
  round: number;
  stage: number;
  severity: SpecSeverity;
  scope: string;
  text: string;
  disposition?: SpecDisposition;
  reason?: string;
  evidence?: string;
  earlier?: string;
  churn?: boolean;
  answer?: { choice: SpecAnswerChoice; reason: string; by: string };
}

export interface SpecRound {
  n: number;
  hash: string;
  openedAt: string;
  closedAt?: string;
  clean?: boolean;
  /** Each stage recorded so far, with each reviewer's status. */
  stages: { stage: number; reviewers: Record<string, "completed" | "not run"> }[];
  findings: SpecFinding[];
  /** The comprehension reviewer's paraphrase, which the author compares with what was meant. */
  paraphrase?: string;
}

export interface SpecReviewRecord {
  rounds: SpecRound[];
  /** Every agent recorded in this review: a resumed reviewer is not a fresh one. */
  agentIds: string[];
  accepted?: { hash: string; round: number; reason: string; by: string; at: string };
}

export function emptySpecReview(): SpecReviewRecord {
  return { rounds: [], agentIds: [] };
}

/** What a round is stamped with: both documents, so an edit to either makes it stale. */
export function specReviewHash(specText: string, planText: string): string {
  return createHash("sha256").update(`${specText}\n---\n${planText}`).digest("hex");
}

const openRound = (record: SpecReviewRecord): SpecRound | null => {
  const last = record.rounds.at(-1);
  return last && !last.closedAt ? last : null;
};

const closedRounds = (record: SpecReviewRecord): SpecRound[] =>
  record.rounds.filter((r) => r.closedAt);

/** What stops the rounds until a person answers, or null. */
export function specReviewStop(record: SpecReviewRecord): "cap" | "churn" | "not run" | null {
  const closed = closedRounds(record);
  const last = closed.at(-1);
  if (!last) return null;
  if (last.findings.some((f) => f.churn)) return "churn";
  if (closed.length >= MAX_SPEC_ROUNDS) return "cap";
  if (last.stages.some((s) => Object.values(s.reviewers).includes("not run"))) return "not run";
  return null;
}

const stopBlocks = (record: SpecReviewRecord, stop: string | null): boolean =>
  (stop === "cap" || stop === "churn") && record.accepted?.round !== closedRounds(record).length;

/**
 * The round to work on: the open one on this hash, a fresh one when the document changed under an
 * open round (its stages read another text and count for nothing), or a refusal at a stop.
 */
export function openSpecRound(
  record: SpecReviewRecord,
  hash: string,
  at: string,
): { round: SpecRound } | { refused: string } {
  const open = openRound(record);
  if (open?.hash === hash) return { round: open };
  const stop = specReviewStop(record);
  if (stopBlocks(record, stop))
    return {
      refused:
        stop === "cap"
          ? `the review reached its cap of ${MAX_SPEC_ROUNDS} rounds: a person chooses (crew spec-review <id> accept, or return the document to drafting)`
          : "a churn mark stops the rounds: a new finding that reverting an earlier fix would resolve; a person chooses (crew spec-review <id> accept)",
    };
  if (open) record.rounds.pop();
  const round: SpecRound = {
    n: record.rounds.length + 1,
    hash,
    openedAt: at,
    stages: [],
    findings: [],
  };
  record.rounds.push(round);
  return { round };
}

/** The stage due in a round, or null when all five are recorded. */
export function dueStage(round: SpecRound): SpecStage | null {
  return STAGES.find((s) => !round.stages.some((r) => r.stage === s.stage)) ?? null;
}

export interface ParsedAnswer {
  findings: { severity: SpecSeverity; scope: string; text: string }[];
  /** What the section holds besides findings: the comprehension reviewer's paraphrase. */
  prose: string;
}

/** A reviewer's answer read, or null when it is not one: no findings section, or a line off the shape. */
export function parseSpecAnswer(answer: string): ParsedAnswer | null {
  const at = answer.search(/^## Findings\s*$/m);
  if (at === -1) return null;
  const body = answer.slice(at).replace(/^## Findings\s*$/m, "");
  const end = body.search(/^## /m);
  const lines = (end === -1 ? body : body.slice(0, end)).split("\n");
  const findings: ParsedAnswer["findings"] = [];
  const prose: string[] = [];
  for (const line of lines) {
    if (!/^- F-\d+\b/.test(line)) {
      prose.push(line);
      continue;
    }
    const match = /^- F-\d+ · (Blocker|Major|Nit) · (.+?) · (.+)$/.exec(line.trim());
    if (!match) return null;
    findings.push({
      severity: match[1] as SpecSeverity,
      scope: match[2] as string,
      text: match[3] as string,
    });
  }
  const text = prose.join("\n").trim();
  return { findings, prose: text === "none" || text === "(or: none)" ? "" : text };
}

/** A stage's result written into its round: the findings take their stable ids. */
export function recordSpecStage(
  round: SpecRound,
  stage: SpecStage,
  answers: { role: string; parsed: ParsedAnswer | null }[],
): void {
  const reviewers: Record<string, "completed" | "not run"> = {};
  for (const { role, parsed } of answers) {
    reviewers[role] = parsed ? "completed" : "not run";
    if (!parsed) continue;
    const short = role.replace(/^goldfish-/, "");
    let n = 0;
    for (const f of parsed.findings) {
      n += 1;
      round.findings.push({
        id: `${short}-${round.n}.${stage.stage}-${n}`,
        reviewer: role,
        round: round.n,
        stage: stage.stage,
        ...f,
      });
    }
    if (role === "goldfish-comprehension" && parsed.prose) round.paraphrase = parsed.prose;
  }
  round.stages.push({ stage: stage.stage, reviewers });
}

const findSpecFinding = (record: SpecReviewRecord, id: string): SpecFinding | undefined =>
  record.rounds.flatMap((r) => r.findings).find((f) => f.id === id);

/** A disposition that closes a finding for good, so a later round may settle against it. */
function closes(f: SpecFinding): boolean {
  if (f.disposition === "contest" || f.disposition === "settled" || f.disposition === "decline")
    return true;
  return f.disposition === "escalate" && f.answer?.choice === "confirm";
}

const sameScope = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

export interface ResolveInput {
  finding: string;
  disposition: SpecDisposition;
  reason: string;
  evidence?: string;
  earlier?: string;
  churn?: boolean;
  /** Whether `--evidence` holds in the repository or the item's documents; the caller reads the files. */
  evidenceHolds?: (evidence: string) => string | null;
}

/** A finding's disposition set, or what refuses it; a severity cannot be changed from here. */
export function resolveSpecFinding(record: SpecReviewRecord, input: ResolveInput): string | null {
  const f = findSpecFinding(record, input.finding);
  if (!f) return `no finding ${input.finding} in this review`;
  if (openRound(record)?.n !== f.round)
    return `${f.id} belongs to round ${f.round}, which is closed`;
  if (input.disposition === "contest") {
    if (f.reviewer === "goldfish-comprehension")
      return "a comprehension finding is never contested: if a fresh reader could not follow the document, the document is missing context";
    if (!input.evidence)
      return "contest needs --evidence <file:symbol>, evidence the reviewer could read";
    const wrong = input.evidenceHolds?.(input.evidence);
    if (wrong) return wrong;
  }
  if (input.disposition === "decline" && f.severity !== "Nit")
    return `decline is for a Nit, and ${f.id} is a ${f.severity}: to dispute it, contest it`;
  if (input.disposition === "settled") {
    if (!input.earlier) return "settled needs --earlier <finding>, the one it repeats";
    const earlier = findSpecFinding(record, input.earlier);
    if (!earlier) return `no finding ${input.earlier} in this review`;
    if (earlier.round >= f.round) return `${earlier.id} is not of an earlier round`;
    if (!closes(earlier))
      return `${earlier.id} was not contested, confirmed or declined: a fixed finding raised again stays open`;
    if (!sameScope(earlier.scope, f.scope))
      return `${earlier.id} has another scope ("${earlier.scope}", here "${f.scope}")`;
  }
  f.disposition = input.disposition;
  f.reason = input.reason;
  if (input.evidence) f.evidence = input.evidence;
  if (input.earlier) f.earlier = input.earlier;
  if (input.churn) f.churn = true;
  return null;
}

/** A person's answer to an escalated finding, or what refuses it. */
export function answerSpecFinding(
  record: SpecReviewRecord,
  id: string,
  choice: SpecAnswerChoice,
  reason: string,
  by: string,
): string | null {
  const f = findSpecFinding(record, id);
  if (!f) return `no finding ${id} in this review`;
  if (f.disposition !== "escalate") return `${f.id} is not escalated`;
  f.answer = { choice, reason, by };
  return null;
}

/** A Blocker or a Major that keeps its round from being clean. */
function keepsOpen(f: SpecFinding): boolean {
  if (f.severity === "Nit") return false;
  if (f.disposition === "propose-fix") return true;
  return f.disposition === "escalate" && f.answer?.choice !== "confirm";
}

/** The open round closed, its verdict decided from the review, or what refuses it. */
export function closeSpecRound(record: SpecReviewRecord, at: string): string | null {
  const round = openRound(record);
  if (!round) return "no round is open (crew spec-review <id> check)";
  const due = dueStage(round);
  if (due) return `stage ${due.stage} (${due.name}) is not recorded`;
  const undecided = round.findings.filter((f) => f.severity !== "Nit" && !f.disposition);
  if (undecided.length)
    return `no disposition on ${undecided.map((f) => f.id).join(", ")} (crew spec-review <id> resolve)`;
  const unanswered = round.findings.filter(
    (f) => f.severity !== "Nit" && f.disposition === "escalate" && !f.answer,
  );
  if (unanswered.length)
    return `${unanswered.map((f) => f.id).join(", ")} escalated and not answered: a person answers (crew spec-review <id> answer)`;
  const everyoneRan = round.stages.every((s) =>
    Object.values(s.reviewers).every((status) => status === "completed"),
  );
  round.clean = everyoneRan && !round.findings.some(keepsOpen);
  round.closedAt = at;
  return null;
}

export function specReviewConverged(record: SpecReviewRecord, hash: string): boolean {
  if (openRound(record)) return false;
  const closed = closedRounds(record);
  const [before, last] = closed.slice(-2);
  return closed.length >= 2 && !!before?.clean && !!last?.clean && last.hash === hash;
}

/** A person's acceptance on the document as it is, or what refuses it. */
export function acceptSpecReview(
  record: SpecReviewRecord,
  hash: string,
  reason: string,
  by: string,
  at: string,
): string | null {
  const stop = specReviewStop(record);
  if (!stop)
    return "nothing to accept: only the cap, a churn mark or a reviewer not run stops a review";
  record.accepted = { hash, round: closedRounds(record).length, reason, by, at };
  return null;
}

/** What the guard into build says is missing, empty when the review closed on this hash. */
export function specReviewMissing(record: SpecReviewRecord | undefined, hash: string): string[] {
  if (record?.accepted?.hash === hash) return [];
  if (record && specReviewConverged(record, hash)) return [];
  const prefix = "the spec review";
  if (!record || record.rounds.length === 0)
    return [`${prefix} has not run (crew spec-review <id> check)`];
  const last = closedRounds(record).at(-1);
  if (!openRound(record) && last?.clean && last.hash !== hash)
    return [`${prefix} is stale: spec.md or plan.md changed after it; review again`];
  if (record.accepted && record.accepted.hash !== hash && !openRound(record))
    return [`${prefix} is stale: the acceptance was on another text of spec.md or plan.md`];
  return [`${prefix} has not converged: ${specReviewLine(record)}`];
}

/** One line of where the review stands. */
export function specReviewLine(record: SpecReviewRecord): string {
  const round = record.rounds.at(-1);
  if (!round) return "not started";
  if (!round.closedAt) {
    const due = dueStage(round);
    return `round ${round.n} open, ${due ? `stage ${due.stage} (${due.name}) due` : "all stages recorded, close it"}`;
  }
  const clean = record.rounds.filter((r) => r.clean).length;
  return `round ${round.n} ${round.clean ? "clean" : "not clean"}, ${clean} clean of ${record.rounds.length}`;
}

const SEVERITIES: readonly SpecSeverity[] = ["Blocker", "Major", "Nit"];

/** The consolidated report: the reviewers' status, the findings by severity with what became of each. */
export function renderSpecReview(record: SpecReviewRecord): string {
  const lines = ["# Spec review", "", `Where it stands: ${specReviewLine(record)}.`];
  if (record.accepted)
    lines.push(
      "",
      `Accepted by ${record.accepted.by} at round ${record.accepted.round}: ${record.accepted.reason}`,
    );
  for (const round of record.rounds) {
    lines.push(
      "",
      `## Round ${round.n}`,
      "",
      "| Stage | Reviewer | Status |",
      "| --- | --- | --- |",
    );
    for (const s of round.stages)
      for (const [role, status] of Object.entries(s.reviewers))
        lines.push(`| ${s.stage} | \`${role}\` | ${status} |`);
    if (round.paraphrase) lines.push("", "### What a new reader understood", "", round.paraphrase);
    // Identical findings fold into one line that names each reviewer.
    const folded = new Map<string, SpecFinding[]>();
    for (const f of round.findings) {
      const key = `${f.severity}|${f.scope.toLowerCase()}|${f.text}`;
      folded.set(key, [...(folded.get(key) ?? []), f]);
    }
    for (const severity of SEVERITIES) {
      const rows = [...folded.values()].filter((g) => g[0]?.severity === severity);
      if (!rows.length) continue;
      lines.push("", `### ${severity}`, "");
      for (const group of rows) {
        const f = group[0] as SpecFinding;
        const who = group.map((g) => `\`${g.reviewer}\` ${g.id}`).join(", ");
        const what = f.disposition
          ? `${f.disposition}${f.answer ? ` (${f.answer.choice}, by ${f.answer.by})` : ""}: ${f.reason ?? ""}${f.evidence ? ` [${f.evidence}]` : ""}${f.earlier ? ` [as ${f.earlier}]` : ""}${f.churn ? " [churn]" : ""}`
          : "no disposition";
        lines.push(`- ${who} · ${f.scope} · ${f.text}`, `  - ${what}`);
      }
    }
  }
  return `${lines.join("\n")}\n`;
}
