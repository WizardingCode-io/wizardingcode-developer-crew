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
    stage: 7,
    name: "critic",
    reviewers: ["goldfish-design", "goldfish-structural", "goldfish-style"],
    range: "feature",
    standards: ["spec-feature", "spec-heilmeier"],
  },
  {
    stage: 9,
    name: "readiness",
    reviewers: ["goldfish-readiness", "goldfish-codebase"],
    range: "detailed",
    standards: ["spec-readiness", "spec-reimplementation"],
  },
];

/**
 * The rounds a review runs before build opens (finding 227, the user's D-1 of 2026-11-08-001):
 * round 2 only after a round 1 that is not clean, and then build opens with no person.
 */
const MAX_SPEC_ROUNDS = 2;

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
  /** The brainstorm's brief as recorded, and the lens agents behind it. */
  brief?: { hash: string; agents: Record<string, string>; at: string };
}

/** The six reviewers that read a raw concept, in brainstorm mode. */
export const SPEC_LENSES: readonly string[] = [
  "goldfish-design",
  "goldfish-codebase",
  "goldfish-zoom-out",
  "goldfish-comprehension",
  "goldfish-readiness",
  "goldfish-structural",
];

const BRIEF_SECTIONS = [
  "Overview",
  "Analysis",
  "Goals vs. Non-Goals",
  "Alternatives Weighed",
  "Key Decisions",
];

/** The brief's sections missing or empty. */
export function briefProblems(text: string): string[] {
  return BRIEF_SECTIONS.filter((name) => {
    const heading = new RegExp(`^## ${name.replace(/[.]/g, "\\.")}\\s*$`, "m").exec(text);
    if (!heading) return true;
    const rest = text.slice(heading.index + heading[0].length);
    const next = rest.search(/^## /m);
    return (next === -1 ? rest : rest.slice(0, next)).trim() === "";
  });
}

export function briefHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
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

export type SpecStop = "churn" | "not run";

const everyReviewerRan = (round: SpecRound): boolean =>
  !round.stages.some((s) => Object.values(s.reviewers).includes("not run"));

/** What stops the rounds before round 2 until a person accepts, or null. */
export function specReviewStop(record: SpecReviewRecord): SpecStop | null {
  const last = closedRounds(record).at(-1);
  if (!last) return null;
  if (last.findings.some((f) => f.churn)) return "churn";
  if (!everyReviewerRan(last)) return "not run";
  return null;
}

/**
 * Why the review is done, or null: a clean round, two closed rounds, or a person's
 * accept. Done holds on whatever text follows: the fixes applied after a round do not reopen it.
 */
export function specReviewDone(record: SpecReviewRecord): "clean" | "rounds" | "accepted" | null {
  if (openRound(record)) return null;
  if (record.accepted) return "accepted";
  const closed = closedRounds(record);
  if (closed.at(-1)?.clean) return "clean";
  return closed.length >= MAX_SPEC_ROUNDS ? "rounds" : null;
}

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
  // An edit while a round is open drops that round: the fresh one keeps its number.
  if (open) record.rounds.pop();
  if (specReviewDone(record)) return { refused: doneText(record) };
  if (specReviewStop(record) === "churn") return { refused: CHURN_TEXT };
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

/** The scope a finding takes when its line gave none (finding 236): never equal to itself for `settled`. */
export const NO_SCOPE = "not given";

export interface ParsedAnswer {
  findings: { severity: SpecSeverity; scope: string; text: string }[];
  /** What the section holds besides findings: the comprehension reviewer's paraphrase. */
  prose: string;
  /** The lines read without refusing though off the four fields (finding 236), by their number in the answer. */
  mended: { line: number; kind: "no-scope" | "joined" }[];
}

/** An answer that is no review: no findings section, or the finding lines whose severity cannot be read. */
export type RefusedAnswer =
  | { refused: "no-section" }
  | { refused: "off-shape"; lines: { line: number; text: string }[] };

/** What makes a line a finding line: `F-<n>` first, at the first column after its `- ` or under an indent or another bullet. */
const FINDING_LABEL = /^F-\d+\b/;
const FOUR_FIELDS = /^- F-\d+ · (Blocker|Major|Nit) · (.+?) · (.+)$/;
const THREE_FIELDS = /^- F-\d+ · (Blocker|Major|Nit) · (.+)$/;

/**
 * A reviewer's answer read line by line (finding 236). A finding is one line at the first column,
 * of the four fields or of three with no scope; a line indented under a finding ends that finding's
 * text. Any other line that starts `F-<n>` under its indent and its bullet is off the shape and
 * refuses the answer: no severity is guessed, and a finding line is never joined to another, whose
 * severity would hide its own.
 */
export function parseSpecAnswer(answer: string): ParsedAnswer | RefusedAnswer {
  const at = answer.search(/^## Findings\s*$/m);
  if (at === -1) return { refused: "no-section" };
  // The heading's own line number, from 1: the section's lines follow it.
  const heading = answer.slice(0, at).split("\n").length;
  const body = answer.slice(at).replace(/^## Findings\s*$/m, "");
  const end = body.search(/^## /m);
  const lines = (end === -1 ? body : body.slice(0, end)).split("\n");
  const findings: ParsedAnswer["findings"] = [];
  const mended: ParsedAnswer["mended"] = [];
  const off: { line: number; text: string }[] = [];
  const prose: string[] = [];
  // The finding an indented line would join: the last line read was it, or a line joined to it.
  let open: ParsedAnswer["findings"][number] | null = null;
  lines.forEach((raw, i) => {
    const line = heading + i;
    const text = raw.trim();
    if (raw.startsWith("- ") && FINDING_LABEL.test(raw.slice(2))) {
      const four = FOUR_FIELDS.exec(text);
      const three = four ? null : THREE_FIELDS.exec(text);
      if (four)
        open = {
          severity: four[1] as SpecSeverity,
          scope: four[2] as string,
          text: four[3] as string,
        };
      else if (three) {
        open = { severity: three[1] as SpecSeverity, scope: NO_SCOPE, text: three[2] as string };
        mended.push({ line, kind: "no-scope" });
      } else {
        open = null;
        off.push({ line, text });
        return;
      }
      findings.push(open);
      return;
    }
    // Under its bullet, with the spaces a second one leaves (`-  x`).
    const bare = text.replace(/^[-*] /, "").trim();
    if (FINDING_LABEL.test(bare)) {
      open = null;
      off.push({ line, text });
      return;
    }
    if (open && text !== "" && /^[ \t]/.test(raw)) {
      open.text = `${open.text} ${bare}`;
      mended.push({ line, kind: "joined" });
      return;
    }
    open = null;
    prose.push(raw);
  });
  if (off.length) return { refused: "off-shape", lines: off };
  const text = prose.join("\n").trim();
  return { findings, prose: text === "none" || text === "(or: none)" ? "" : text, mended };
}

const numbered = (lines: number[]): string =>
  lines.length === 1
    ? `line ${lines[0]}`
    : `lines ${lines.slice(0, -1).join(", ")} and ${lines.at(-1)}`;

/** What a recorded answer's mended lines were, for the command's answer; "" when it had none. */
export function mendedText(mended: ParsedAnswer["mended"]): string {
  const of = (kind: "no-scope" | "joined") =>
    mended.filter((m) => m.kind === kind).map((m) => m.line);
  const bare = of("no-scope");
  const joined = of("joined");
  return [
    bare.length ? `${numbered(bare)} had no scope (recorded as "${NO_SCOPE}")` : "",
    joined.length
      ? `${numbered(joined)} joined to the finding above ${joined.length === 1 ? "it" : "them"}`
      : "",
  ]
    .filter(Boolean)
    .join(", ");
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
    // No stage launches goldfish-comprehension since the rounds became stages 5, 7 and 9; a round
    // recorded before keeps its paraphrase, its contest rule and its report section.
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
    // A scope the engine wrote is no scope (finding 236): two of them would pass as the same one.
    const bare = [f, earlier].find((x) => sameScope(x.scope, NO_SCOPE));
    if (bare)
      return `${bare.id} was recorded with no scope: a finding with no scope cannot be settled against another by scope; fix it, contest it or give it to the person`;
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

/** A Blocker that keeps its round from being clean: a Major or a Nit never does (finding 227). */
function keepsOpen(f: SpecFinding): boolean {
  if (f.severity !== "Blocker") return false;
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

const CHURN_TEXT =
  "a churn mark stops the rounds: a new finding that reverting an earlier fix would resolve; a person chooses (crew spec-review <id> accept)";

/** What `check` says once the review is done. */
export function doneText(record: SpecReviewRecord): string {
  const done = specReviewDone(record);
  const why =
    done === "accepted"
      ? "a person accepted it"
      : done === "clean"
        ? `round ${closedRounds(record).length} is clean`
        : "it ran its two rounds";
  return `the spec review is done: ${why}; build is open`;
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
  if (!stop || specReviewDone(record))
    return "nothing to accept: only a churn mark or a reviewer not run stops a review before round 2";
  record.accepted = { hash, round: closedRounds(record).length, reason, by, at };
  return null;
}

/** What the guard into build says is missing, empty once the review is done (finding 227). */
export function specReviewMissing(record: SpecReviewRecord | undefined): string[] {
  if (record && specReviewDone(record)) return [];
  const prefix = "the spec review";
  if (!record || record.rounds.length === 0)
    return [`${prefix} has not run (crew spec-review <id> check)`];
  return [`${prefix} is not done: ${specReviewLine(record)}`];
}

/** One line of where the review stands. */
export function specReviewLine(record: SpecReviewRecord): string {
  const round = record.rounds.at(-1);
  if (!round) return "not started";
  if (!round.closedAt) {
    const due = dueStage(round);
    return `round ${round.n} open, ${due ? `stage ${due.stage} (${due.name}) due` : "all stages recorded, close it"}`;
  }
  const done = specReviewDone(record);
  if (done === "clean") return `done: round ${round.n} clean`;
  if (done === "rounds") return "done: two rounds";
  if (done === "accepted") return `done: accepted after round ${round.n}`;
  const stopped = specReviewStop(record) === "churn" ? "; stopped (churn)" : "";
  return `round ${round.n} not clean${stopped}`;
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
