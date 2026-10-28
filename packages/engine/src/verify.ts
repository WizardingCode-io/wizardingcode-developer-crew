import {
  isQuestionArea,
  QUESTIONS,
  type QuestionArea,
  RISK_QUESTIONS,
  ROUTE_QUESTIONS,
  type RouteJudgement,
} from "./classify.ts";
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
import { disputedDefault, disputedDefaultText } from "./policy.ts";
import { scanText } from "./secrets.ts";
import type {
  DecisionMarks,
  FindingVerification,
  JudgementGateName,
  JudgementRecord,
  MailPriority,
  Policy,
  RiskArea,
  Verification,
  VerifyAsk,
} from "./types.ts";

/** The subject of each rubric in one sentence, named in the defect's question (decision 10). */
export const RUBRIC_QUESTIONS: Record<JudgementGateName, string> = {
  strategy:
    "a fault of the strategy as the strategy rubric names it: an element not required by a stated need (over-engineering), a claim whose mark names no researched fact, a cost or a time guessed rather than measured, a scaling phase without an observable trigger, a smaller answer not argued point by point where the request asked for more",
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
  /** A decision's question, default or answer (the security lead's round 2 of 2026-10-28-004). */
  decision: 2 * 1024,
};

export function clipAt(text: string, max: number): string {
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
      text: clipAt(c.finding.text, CAPS.findingText),
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
    { state: { ...input, conclave: clipAt(input.conclave, CAPS.conclave) }, questions },
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
    request: { ...input.request, text: safeField(input.request.text, "request", CAPS.request) },
    business_priorities:
      input.business_priorities === null
        ? null
        : clipAt(input.business_priorities, CAPS.priorities),
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

/**
 * A text field as it may leave the machine (2026-10-28-004, the security lead's rule): a secret in it
 * replaced by its rule, never its value, as the knowledge ask's titles are; the clip comes after.
 */
export function safeField(text: string, source: string, max?: number): string {
  const finding = scanText(text, source)[0];
  const safe = finding ? `[redacted: ${finding.rule}]` : text;
  return max === undefined ? safe : clipAt(safe, max);
}

/**
 * The risk area an answer changes (D-2 of 2026-10-28-004): the noul and the choice's confidence
 * both at or above the threshold and the choice one of the six areas a question names; null
 * otherwise, `none` included.
 */
export function answerArea(
  marks: Pick<DecisionMarks, "changesRisk" | "area" | "areaConfidence"> | undefined,
  policy: Policy,
): QuestionArea | null {
  const t = policy.verify.threshold;
  if (!marks || typeof marks.changesRisk !== "number" || marks.changesRisk < t) return null;
  if ((marks.areaConfidence ?? 0) < t || !marks.area || !isQuestionArea(marks.area)) return null;
  return marks.area;
}

/**
 * Jev's marks of a decision in one line, the form the command and the report print
 * (2026-10-28-004): `jev: default conservative 0.91; the user's call 0.84; the answer changes auth
 * (0.90)`, a disputed default opening it as `disputed by jev: …`; empty without marks.
 */
export function decisionMarkText(marks: DecisionMarks | undefined, policy: Policy): string {
  if (!marks) return "";
  const disputed = disputedDefault(marks, policy);
  const parts: string[] = [];
  if (typeof marks.conservative === "number")
    parts.push(
      disputed
        ? disputedDefaultText(marks.conservative, "the default")
        : `default conservative ${two(marks.conservative)}`,
    );
  if (typeof marks.usersCall === "number") parts.push(`the user's call ${two(marks.usersCall)}`);
  if (typeof marks.changesRisk === "number") {
    const area = answerArea(marks, policy);
    parts.push(
      area
        ? `the answer changes ${area} (${two(marks.changesRisk)})`
        : `the answer changes no risk area (${two(marks.changesRisk)})`,
    );
  }
  if (!parts.length) return "";
  return disputed ? parts.join("; ") : `jev: ${parts.join("; ")}`;
}

export interface RouteOutcome {
  judgement: RouteJudgement | null;
  reason?: string;
  records: Verification[];
}

/**
 * The route ask (2026-10-28-004, D-1): the nine typed questions of `QUESTIONS` over the request's
 * text, one request, every answer recorded; the judgement typed, or the reason it is missing.
 */
export async function verifyRoute(
  cfg: JevConfig,
  input: { text: string },
  options: AskOptions = {},
): Promise<RouteOutcome> {
  const questions: Record<string, JevQuestion> = {};
  for (const id of ROUTE_QUESTIONS) questions[id] = QUESTIONS[id] as JevQuestion;
  const state = { request: { text: safeField(input.text, "request", CAPS.request) } };
  const result = await askJev(cfg, { state, questions }, options);
  if (!result.ok) return { judgement: null, reason: UNAVAILABLE(result.unavailable), records: [] };
  const records: Verification[] = [];
  const confidenceOf = (a: JevAnswer): number => (a.type === "noul" ? a.noul : a.confidence);
  for (const id of ROUTE_QUESTIONS) {
    const answer = result.answers[id];
    if (answer)
      records.push(
        record(
          "route",
          id,
          QUESTIONS[id] as JevQuestion,
          answer,
          confidenceOf(answer),
          result.model,
        ),
      );
  }
  const type = result.answers.work_type;
  const scope = result.answers.scope;
  const vague = result.answers.is_vague;
  if (type?.type !== "choice" || scope?.type !== "score" || vague?.type !== "noul")
    return { judgement: null, reason: UNAVAILABLE("malformed answer"), records };
  const judgement: RouteJudgement = {
    work_type: { choice: type.choice, confidence: type.confidence },
    is_vague: vague.noul,
    scope: { score: scope.score, confidence: scope.confidence },
    touches_auth: 0,
    touches_payments: 0,
    touches_personal_data: 0,
    touches_data_migration: 0,
    touches_infra: 0,
    touches_public_api: 0,
  };
  for (const id of RISK_QUESTIONS) {
    const answer = result.answers[id];
    if (answer?.type !== "noul")
      return { judgement: null, reason: UNAVAILABLE("malformed answer"), records };
    judgement[id] = answer.noul;
  }
  return { judgement, records };
}

export interface DecisionInput {
  title: string;
  id: string;
  question: string;
  default?: string;
}

export interface DecisionOutcome {
  marks: { conservative: number | null; usersCall: number | null; model: string } | null;
  reason?: string;
  records: Verification[];
}

const CONSERVATIVE_QUESTION =
  "Among the answers `decision.question` allows, is `decision.default` the more cautious one: the answer that changes less, keeps what exists, or adds a guard rather than removes one?";
const USERS_CALL_QUESTION =
  "Is `decision.question` one whose answer belongs to the product's owner rather than to the engineer: two competent engineers would build different things, and no good practice settles it?";

/**
 * The decision ask at `crew decision add` (2026-10-28-004, D-3): whether the stated default is the
 * conservative answer (asked only with a default) and whether the question is the user's to take.
 */
export async function verifyDecision(
  cfg: JevConfig,
  input: DecisionInput,
  options: AskOptions = {},
): Promise<DecisionOutcome> {
  const usersCall: JevQuestion = { type: "noul", instructions: USERS_CALL_QUESTION };
  const conservative: JevQuestion | null =
    input.default === undefined ? null : { type: "noul", instructions: CONSERVATIVE_QUESTION };
  const questions: Record<string, JevQuestion> = {
    users_call: usersCall,
    ...(conservative ? { default_is_conservative: conservative } : {}),
  };
  const state = {
    request: { title: safeField(input.title, "title", CAPS.decision) },
    decision: {
      question: safeField(input.question, "decision", CAPS.decision),
      ...(input.default !== undefined
        ? { default: safeField(input.default, "default", CAPS.decision) }
        : {}),
    },
  };
  const result = await askJev(cfg, { state, questions }, options);
  if (!result.ok) return { marks: null, reason: UNAVAILABLE(result.unavailable), records: [] };
  // An answer that is not a noul is malformed, as the route's and the answer's asks say; null
  // stays the mark of a question not asked (the judge's round 2).
  const malformed = { marks: null, reason: UNAVAILABLE("malformed answer"), records: [] };
  const usersCallAnswer = result.answers.users_call;
  if (usersCallAnswer?.type !== "noul") return malformed;
  const records: Verification[] = [];
  let conservativeMark: number | null = null;
  if (conservative) {
    const answer = result.answers.default_is_conservative;
    if (answer?.type !== "noul") return malformed;
    conservativeMark = answer.noul;
    records.push(
      record(
        "decision",
        `${input.id} default_is_conservative`,
        conservative,
        answer,
        answer.noul,
        result.model,
      ),
    );
  }
  records.push(
    record(
      "decision",
      `${input.id} users_call`,
      usersCall,
      usersCallAnswer,
      usersCallAnswer.noul,
      result.model,
    ),
  );
  return {
    marks: { conservative: conservativeMark, usersCall: usersCallAnswer.noul, model: result.model },
    records,
  };
}

export interface AnswerInput {
  title: string;
  id: string;
  question: string;
  default?: string;
  answer: string;
  riskAreas: readonly RiskArea[];
}

export interface AnswerOutcome {
  marks: { changesRisk: number; area: string; areaConfidence: number; model: string } | null;
  reason?: string;
  records: Verification[];
}

const CHANGES_RISK_QUESTION =
  "Does `decision.answer` change who holds a permission or a session, what is paid or priced, which personal data is read, stored or exposed, a database schema or a migration, the infrastructure or the deployment, or an interface other systems depend on?";
/** The choice's criteria, one per area a question names and `none`; the type ties the list to `QUESTION_AREAS`. */
const AREA_CRITERIA: Record<QuestionArea | "none", string> = {
  auth: "authentication, authorization or sessions",
  payments: "payments, billing or pricing",
  "personal-data": "personal data read, stored or exposed",
  "data-migration": "a database schema or a data migration",
  infra: "infrastructure, deployment or CI",
  "public-api": "an interface other systems depend on",
  none: "no risk area: the answer changes none of the six",
};

/**
 * The answer ask at `crew decide` (2026-10-28-004, D-2): whether the answer changes a risk area and
 * which; the area is read by the caller when both marks reach the threshold and the choice is not
 * `none` (the documentation's pairing of a choice with a noul that says whether anything fits).
 */
export async function verifyAnswer(
  cfg: JevConfig,
  input: AnswerInput,
  options: AskOptions = {},
): Promise<AnswerOutcome> {
  const changesRisk: JevQuestion = { type: "noul", instructions: CHANGES_RISK_QUESTION };
  const areaQuestion: JevQuestion = {
    type: "choice",
    instructions: "Which risk area does `decision.answer` change, if any?",
    criteria: AREA_CRITERIA,
  };
  const questions: Record<string, JevQuestion> = { changes_risk: changesRisk, area: areaQuestion };
  const state = {
    request: { title: safeField(input.title, "title", CAPS.decision) },
    decision: {
      question: safeField(input.question, "decision", CAPS.decision),
      ...(input.default !== undefined
        ? { default: safeField(input.default, "default", CAPS.decision) }
        : {}),
      answer: safeField(input.answer, "answer", CAPS.decision),
    },
    risk_areas: [...input.riskAreas],
  };
  const result = await askJev(cfg, { state, questions }, options);
  if (!result.ok) return { marks: null, reason: UNAVAILABLE(result.unavailable), records: [] };
  const records: Verification[] = [];
  const changes = result.answers.changes_risk;
  const area = result.answers.area;
  if (changes?.type !== "noul" || area?.type !== "choice")
    return { marks: null, reason: UNAVAILABLE("malformed answer"), records };
  records.push(
    record(
      "decision",
      `${input.id} changes_risk`,
      changesRisk,
      changes,
      changes.noul,
      result.model,
    ),
  );
  records.push(
    record("decision", `${input.id} area`, areaQuestion, area, area.confidence, result.model),
  );
  return {
    marks: {
      changesRisk: changes.noul,
      area: area.choice,
      areaConfidence: area.confidence,
      model: result.model,
    },
    records,
  };
}
