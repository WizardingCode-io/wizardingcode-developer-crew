import { nowIso } from "./fs.ts";
import {
  type AskOptions,
  answerOf,
  askJev,
  type JevAnswer,
  type JevConfig,
  type JevQuestion,
  type Mark,
  markOf,
  topLevel,
  two,
} from "./jev.ts";
import { hunkLines } from "./judgement.ts";
import type {
  FindingVerification,
  JudgementGateName,
  JudgementRecord,
  MailPriority,
  Policy,
  Verification,
  VerifyAsk,
} from "./types.ts";

/** The subject of each rubric in one sentence, named in the defect's question (decision 10). */
export const RUBRIC_QUESTIONS: Record<JudgementGateName, string> = {
  "code-quality":
    "a violation of SOLID or KISS as the code-quality rubric's six questions name it: a type with more than one reason to change, a copy of logic, a name that says the opposite of what the code does, dead or unreachable code, a workaround, a hardcoded value",
  "test-quality":
    "a test that would not fail if the behaviour it names broke, a criterion with no such test, or an assertion true by construction",
  "ui-ux":
    "a page whose criterion is not visible in the capture, a missing state (loading, empty, error), a control without a keyboard path or a label, or copy outside the project's language and voice",
  security:
    "a path by which authentication, authorisation, personal data, payments, a public API or a migration can be misused, leaked or bypassed",
  architecture:
    "a drift from the project's defined architecture, data model, contracts or integrations",
  data: "a schema, migration, query, transaction or index that loses, corrupts or blocks data",
  infra: "a pipeline, deployment, host, secret or rollback that fails or exposes something",
  risk: "a change whose failure in production has no rollback, loses data, breaks a third party or has no watch in its first hour",
};

/** What a `Verification` may carry; the caps on what leaves the machine (security review of SP3 Task 6). */
export const CAPS = {
  findingText: 1000,
  conclave: 16 * 1024,
  request: 8 * 1024,
  priorities: 8 * 1024,
};

export function cut(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function askAllowed(policy: Policy, ask: VerifyAsk): boolean {
  return policy.verify.asks.includes(ask);
}

function record(
  what: Verification["what"],
  ref: string,
  question: JevQuestion,
  answer: JevAnswer,
  confidence: number | null,
  model: string,
): Verification {
  return {
    what,
    ref,
    question:
      typeof question.instructions === "string"
        ? question.instructions
        : JSON.stringify(question.instructions),
    answer,
    confidence,
    model,
    at: nowIso(),
  };
}

const UNAVAILABLE = (reason: string): string => `jev unavailable: ${reason}`;

function findingMark(mark: Mark): FindingVerification {
  return {
    status: mark.status,
    ...(mark.reason ? { reason: mark.reason } : {}),
    ...(mark.confidence !== null ? { confidence: mark.confidence } : {}),
  };
}

/** The mark one finding gets, returned to the caller who owns the records (finding 90). */
export interface DefectMark {
  finding: JudgementRecord["findings"][number];
  mark: FindingVerification;
}

export interface DefectsOutcome {
  /** The verifications answered, to append to the evidence; empty when unavailable. */
  records: Verification[];
  /** The unavailability, when the ask was made and failed. */
  unavailable: string | null;
  /** How many findings were sent. */
  sent: number;
  /** The marks for the findings, applied by the caller (`applyDefectMarks`). */
  marks: DefectMark[];
}

/**
 * The upheld defects of not-proven rulings asked as the rubric's question (decision 10): a finding
 * without a line or outside the change's hunks is unverified by hand, the rest up to the policy's
 * cap go in one request; each sent finding gets its mark on the record. Unavailable records nothing
 * and marks every sent finding with the reason.
 */
export async function verifyDefects(
  cfg: JevConfig,
  policy: Policy,
  records: JudgementRecord[],
  patch: string,
  options: AskOptions = {},
): Promise<DefectsOutcome> {
  const candidates = records.flatMap((r) =>
    r.verdict === "not-proven"
      ? r.findings
          .filter((f) => f.severity === "defect" && !f.outside)
          .map((f) => ({ record: r, finding: f }))
      : [],
  );
  const sent: {
    id: string;
    record: JudgementRecord;
    finding: (typeof candidates)[number]["finding"];
    question: JevQuestion;
  }[] = [];
  const marks: DefectMark[] = [];
  const unverified = (finding: DefectMark["finding"], reason: string) =>
    marks.push({ finding, mark: { status: "unverified", reason } });
  const state: Record<string, unknown> = {};
  const questions: Record<string, JevQuestion> = {};
  const snippets = policy.verify.send === "claims-and-snippets";
  for (const c of candidates) {
    if (c.finding.line === undefined) {
      unverified(c.finding, "no line");
      continue;
    }
    const lines = hunkLines(patch, c.finding.file, c.finding.line);
    if (!lines) {
      unverified(c.finding, "line outside the change's hunks");
      continue;
    }
    if (sent.length >= policy.verify.maxClaimsPerItem) {
      unverified(c.finding, "over verify.maxClaimsPerItem");
      continue;
    }
    const id = `d${sent.length + 1}`;
    state[id] = {
      file: c.finding.file,
      line: c.finding.line,
      text: cut(c.finding.text, CAPS.findingText),
      rubric: RUBRIC_QUESTIONS[c.record.gate],
      ...(snippets ? { lines: lines.text } : {}),
    };
    const question: JevQuestion = snippets
      ? {
          type: "choice",
          instructions: `What is the relation between the cited lines \`findings.${id}.lines\` and the finding's \`text\` at \`findings.${id}\`?`,
          criteria: {
            supports: "the lines show what the text says",
            contradicts: "the lines show the opposite, or the text does not hold on them",
            says_nothing: "the lines do not show whether the text holds",
          },
        }
      : {
          type: "noul",
          instructions: `Does the finding at \`findings.${id}\`, taken at its word (its \`text\` about \`file\` at \`line\`), describe a defect of the kind \`findings.${id}.rubric\` names?`,
          criteria: {
            true: "the text, read literally, names such a defect",
            false: "the text names something else, or no defect",
          },
        };
    questions[id] = question;
    sent.push({ id, record: c.record, finding: c.finding, question });
  }
  if (!sent.length) return { records: [], unavailable: null, sent: 0, marks };
  const result = await askJev(cfg, { state: { findings: state }, questions }, options);
  if (!result.ok) {
    for (const s of sent) unverified(s.finding, UNAVAILABLE(result.unavailable));
    return { records: [], unavailable: result.unavailable, sent: sent.length, marks };
  }
  const out: Verification[] = [];
  for (const s of sent) {
    const answer = answerOf(result.answers, s.id);
    const mark = markOf(answer, policy.verify.threshold);
    marks.push({ finding: s.finding, mark: findingMark(mark) });
    out.push(
      record(
        "defect",
        `${s.record.gate} ${s.finding.file}:${s.finding.line}`,
        s.question,
        answer,
        mark.confidence,
        result.model,
      ),
    );
  }
  return { records: out, unavailable: null, sent: sent.length, marks };
}

/** The marks of an ask written onto the findings they name; the outcome, for chaining. */
export function applyDefectMarks(outcome: DefectsOutcome): DefectsOutcome {
  for (const { finding, mark } of outcome.marks) finding.verification = mark;
  return outcome;
}

export interface ValidatorInput {
  conclave: string;
  decisions: { id: string; question: string; answer: string | null; default: string | null }[];
  objections: { id: string; severity: string; status: string; criterion: string | null }[];
}

export interface ValidatorOutcome {
  status: "verified" | "disputed" | "unverified";
  condition: string | null;
  confidence: number | null;
  reason?: string;
  records: Verification[];
}

const VALIDATOR_QUESTIONS: Record<"v1" | "v2", string> = {
  v1: "Is every decision listed in `conclave` under the heading 'Decisions only the user can make' present in `decisions` with an answer or a stated default?",
  v2: "Is every warning listed in `conclave` under 'Warnings' that names a security, data or payment risk present in `objections`?",
};

/** The validator's rule asked as two nouls (decision 10): both yes verified, any no disputed naming the condition, else unverified. */
export async function verifyValidator(
  cfg: JevConfig,
  policy: Policy,
  input: ValidatorInput,
  options: AskOptions = {},
): Promise<ValidatorOutcome> {
  const questions: Record<string, JevQuestion> = {
    v1: { type: "noul", instructions: VALIDATOR_QUESTIONS.v1 },
    v2: { type: "noul", instructions: VALIDATOR_QUESTIONS.v2 },
  };
  const result = await askJev(
    cfg,
    { state: { ...input, conclave: cut(input.conclave, CAPS.conclave) }, questions },
    options,
  );
  if (!result.ok)
    return {
      status: "unverified",
      condition: null,
      confidence: null,
      reason: UNAVAILABLE(result.unavailable),
      records: [],
    };
  const records: Verification[] = [];
  let outcome: ValidatorOutcome = {
    status: "verified",
    condition: null,
    confidence: null,
    records,
  };
  for (const id of ["v1", "v2"] as const) {
    const answer = result.answers[id];
    const question = questions[id];
    if (!answer || !question) continue;
    const mark = markOf(answer, policy.verify.threshold);
    records.push(
      record(
        "validator",
        `complete-gap-round ${id}`,
        question,
        answer,
        mark.confidence,
        result.model,
      ),
    );
    if (mark.status === "disputed" && outcome.status !== "disputed")
      outcome = {
        status: "disputed",
        condition: VALIDATOR_QUESTIONS[id],
        confidence: mark.confidence,
        records,
      };
    else if (mark.status === "unverified" && outcome.status === "verified")
      outcome = {
        status: "unverified",
        condition: null,
        confidence: mark.confidence,
        reason: mark.reason,
        records,
      };
  }
  return outcome;
}

export interface FactInput {
  id: string;
  claim: string;
  quote: string;
  excerpt: string;
}

export interface FactsOutcome {
  marks: Record<string, Mark>;
  unavailable: string | null;
  records: Verification[];
}

/** The found facts asked together as relation choices (decision 10). */
export async function verifyFacts(
  cfg: JevConfig,
  policy: Policy,
  facts: FactInput[],
  options: AskOptions = {},
): Promise<FactsOutcome> {
  if (!facts.length) return { marks: {}, unavailable: null, records: [] };
  const state: Record<string, unknown> = {};
  const questions: Record<string, JevQuestion> = {};
  const ids = new Map<string, string>();
  facts.forEach((f, i) => {
    const id = `f${i + 1}`;
    ids.set(f.id, id);
    state[id] = { claim: f.claim, quote: f.quote, excerpt: f.excerpt };
    questions[id] = {
      type: "choice",
      instructions: `What is the relation between the excerpt \`facts.${id}.excerpt\` of the source and the quote \`facts.${id}.quote\` the researcher cited for the claim \`facts.${id}.claim\`?`,
      criteria: {
        supports: "the excerpt contains the quote's meaning as cited",
        contradicts: "the excerpt says otherwise",
        says_nothing: "the excerpt does not settle it",
      },
    };
  });
  const result = await askJev(cfg, { state: { facts: state }, questions }, options);
  if (!result.ok) {
    const marks: Record<string, Mark> = {};
    for (const f of facts)
      marks[f.id] = {
        status: "unverified",
        confidence: null,
        reason: UNAVAILABLE(result.unavailable),
      };
    return { marks, unavailable: result.unavailable, records: [] };
  }
  const marks: Record<string, Mark> = {};
  const records: Verification[] = [];
  for (const f of facts) {
    const id = ids.get(f.id) ?? "";
    const answer = result.answers[id];
    const question = questions[id];
    if (!answer || !question) continue;
    const mark = markOf(answer, policy.verify.threshold);
    marks[f.id] = mark;
    records.push(record("fact", f.id, question, answer, mark.confidence, result.model));
  }
  return { marks, unavailable: null, records };
}

export const PRIORITY_LEVELS: readonly MailPriority[] = ["low", "normal", "high", "blocker"];
const LEVEL_TEXT: Record<MailPriority, string> = {
  low: "a cosmetic or convenience change nobody is waiting on",
  normal: "ordinary work the business expects in its turn",
  high: "work a signed deadline or a named client commitment depends on",
  blocker: "production is down or a client cannot work until it is done",
};
const FLAGS = ["is_production_down", "names_a_signed_deadline", "is_vague"] as const;
const FLAG_QUESTIONS: Record<(typeof FLAGS)[number], string> = {
  is_production_down: "Does `request.text` say production, or a client's use of it, is down now?",
  names_a_signed_deadline:
    "Does `request.text` name a deadline or a commitment that `business_priorities` lists?",
  is_vague: "Would two competent engineers build different things from `request.text`?",
};

export interface TriageInput {
  request: {
    text: string;
    channel: string;
    connector: string | null;
    proposed_priority: MailPriority;
  };
  business_priorities: string | null;
  queue: { kind: string; priority: string }[];
}

export interface TriageProposal {
  level: MailPriority;
  confidence: number;
  probabilities: Record<string, number>;
  flags: Record<(typeof FLAGS)[number], number>;
  capped: boolean;
}

export interface TriageOutcome {
  proposal: TriageProposal | null;
  reason?: string;
  records: Verification[];
}

function rank(p: MailPriority): number {
  return PRIORITY_LEVELS.indexOf(p);
}

/**
 * A source's triage asked as a score over the four levels and three nouls (decision 10): the level
 * is the highest-probability one, a proposal only when the score's confidence reaches the threshold,
 * capped at the source's own proposal; never the record.
 */
export async function verifyTriage(
  cfg: JevConfig,
  policy: Policy,
  input: TriageInput,
  options: AskOptions = {},
): Promise<TriageOutcome> {
  const state = {
    request: { ...input.request, text: cut(input.request.text, CAPS.request) },
    business_priorities:
      input.business_priorities === null ? null : cut(input.business_priorities, CAPS.priorities),
    queue: input.queue,
  };
  const questions: Record<string, JevQuestion> = {
    priority: {
      type: "score",
      instructions:
        "Judged against `business_priorities` and the open `queue`, which level does `request` deserve?",
      criteria: PRIORITY_LEVELS.map((l) => LEVEL_TEXT[l]),
    },
  };
  for (const flag of FLAGS) questions[flag] = { type: "noul", instructions: FLAG_QUESTIONS[flag] };
  const result = await askJev(cfg, { state, questions }, options);
  if (!result.ok) return { proposal: null, reason: UNAVAILABLE(result.unavailable), records: [] };
  const records: Verification[] = [];
  const score = result.answers.priority;
  const flags = {} as Record<(typeof FLAGS)[number], number>;
  for (const flag of FLAGS) {
    const answer = result.answers[flag];
    const question = questions[flag];
    if (answer?.type === "noul" && question) {
      flags[flag] = answer.noul;
      records.push(record("triage", flag, question, answer, answer.noul, result.model));
    }
  }
  const scoreQuestion = questions.priority;
  if (score?.type !== "score" || !scoreQuestion)
    return { proposal: null, reason: "jev unavailable: malformed answer", records };
  // The legend maps the level numbers to the levels' text; the probabilities are keyed by the legend's keys.
  const byLevel: Record<string, number> = {};
  for (const [key, text] of Object.entries(score.legend)) {
    const level = PRIORITY_LEVELS.find((l) => LEVEL_TEXT[l] === text);
    if (level) byLevel[level] = score.probabilities[key] ?? 0;
  }
  const normalised = { ...score, probabilities: byLevel };
  const top = topLevel(normalised, PRIORITY_LEVELS);
  records.push(record("triage", "priority", scoreQuestion, score, score.confidence, result.model));
  if (score.confidence < policy.verify.threshold)
    return {
      proposal: null,
      reason: `confidence ${two(score.confidence)} under ${policy.verify.threshold}`,
      records,
    };
  const capped = rank(top.level as MailPriority) > rank(input.request.proposed_priority);
  return {
    proposal: {
      level: capped ? input.request.proposed_priority : (top.level as MailPriority),
      confidence: score.confidence,
      probabilities: byLevel,
      flags,
      capped,
    },
    records,
  };
}
