import { matchesAny } from "./glob.ts";
import { two } from "./jev.ts";
import { isTestPath } from "./paths-kind.ts";
import type { MailPriority, Policy, RiskArea, Route, WorkKind, WorkType } from "./types.ts";
import { ROUTE_ORDER } from "./types.ts";

export type QuestionType = "choice" | "noul" | "score";
export interface Question {
  type: QuestionType;
  instructions: string;
  criteria?: Record<string, string> | string[];
}

const WORK_TYPES: Record<WorkType, string> = {
  audit: "an end-to-end audit of an existing codebase, delivered as a report a person signs (SP8)",
  fix: "repairs behaviour that is wrong today",
  feature: "adds or changes behaviour on purpose",
  refactor: "changes structure without changing behaviour",
  chore: "tooling, dependencies, configuration or documentation",
  "new-product": "a new application or service from scratch",
  question: "the user wants an answer, not a change",
};

/** The same shape Jev and Laya accept, so a later backend can answer the same questions. */
export const QUESTIONS = {
  work_type: {
    type: "choice",
    instructions: "What kind of work does this request ask for?",
    criteria: WORK_TYPES,
  },
  is_vague: {
    type: "noul",
    instructions:
      "Is information missing without which two competent engineers would build different things?",
  },
  scope: {
    type: "score",
    instructions: "How much of the codebase does this change touch?",
    criteria: ["one spot", "one module", "several modules", "the whole system"],
  },
  touches_auth: {
    type: "noul",
    instructions: "Does this change authentication, authorization or sessions?",
  },
  touches_payments: {
    type: "noul",
    instructions: "Does this change payments, billing or pricing?",
  },
  touches_personal_data: {
    type: "noul",
    instructions: "Does this read, store or expose personal data?",
  },
  touches_data_migration: {
    type: "noul",
    instructions: "Does this change a database schema or migrate data?",
  },
  touches_infra: {
    type: "noul",
    instructions: "Does this change infrastructure, deployment or CI?",
  },
  touches_public_api: {
    type: "noul",
    instructions: "Does this change an interface other systems depend on?",
  },
  // The two optional answers of SP3 (SP7 §7.1): the kind picks the phases, the priority the urgency.
  kind: {
    type: "choice",
    instructions: "What kind of work is this, beyond its type?",
    criteria: {
      "client-request": "a request that entered from a task manager or a document",
      "cross-project": "a request another project of the workspace sent by mail",
      "new-project": "a new project or a feature the conclave raises to a strategy",
      feature: "a change to a project that exists",
      issue: "a defect to analyse to its origin before it is fixed",
      audit:
        "an existing codebase audited end to end, with a report a person signs (work_type audit)",
    },
  },
  priority: {
    type: "score",
    instructions: "What priority does this request deserve for the business?",
    criteria: [
      "low: a nicety or a cleanup",
      "normal: a wanted change with no deadline at risk",
      "high: a client cannot complete a core flow, or a signed deadline is at risk this week",
      "blocker: production is down or data is being lost for a client",
    ],
  },
} as const satisfies Record<string, Question>;

/** The answers a request may leave out: the engine derives the kind and reads the priority from the flags. */
const OPTIONAL: ReadonlySet<string> = new Set(["kind", "priority"]);

/** The priority a `priority` answer's level names: 0 low, 1 normal, 2 high, 3 blocker. */
export const PRIORITY_LEVELS: readonly MailPriority[] = ["low", "normal", "high", "blocker"];

export type QuestionId = keyof typeof QUESTIONS;

export interface Answers {
  work_type: WorkType;
  is_vague: number;
  scope: number;
  touches_auth: number;
  touches_payments: number;
  touches_personal_data: number;
  touches_data_migration: number;
  touches_infra: number;
  touches_public_api: number;
  kind?: WorkKind;
  priority?: number;
}

export class AnswerError extends Error {
  constructor(public readonly problems: string[]) {
    super(problems.join("; "));
    this.name = "AnswerError";
  }
}

export const RISK_THRESHOLD = 0.3;
export const VAGUE_THRESHOLD = 0.5;

/** Jev's reading of the nine typed questions over the request's text (2026-10-28-004): the choice and the score with their confidence, the seven nouls. */
export interface RouteJudgement {
  work_type: { choice: string; confidence: number };
  is_vague: number;
  scope: { score: number; confidence: number };
  touches_auth: number;
  touches_payments: number;
  touches_personal_data: number;
  touches_data_migration: number;
  touches_infra: number;
  touches_public_api: number;
}

/** The risk area each risk question names: the six questions and the six areas in one place. */
const AREA_BY_QUESTION = {
  touches_auth: "auth",
  touches_payments: "payments",
  touches_personal_data: "personal-data",
  touches_data_migration: "data-migration",
  touches_infra: "infra",
  touches_public_api: "public-api",
} as const satisfies Partial<Record<QuestionId, RiskArea>>;
/** The six risk questions, the keys of `AREA_BY_QUESTION` (the judge's round 1 of 2026-10-28-004). */
export type RiskQuestionId = keyof typeof AREA_BY_QUESTION;
export const RISK_QUESTIONS = Object.keys(AREA_BY_QUESTION) as readonly RiskQuestionId[];
/** One of the six areas a question names; `policy.ts`'s own list adds `secrets`, which paths raise and no question asks. */
export type QuestionArea = (typeof AREA_BY_QUESTION)[RiskQuestionId];
export const QUESTION_AREAS: readonly QuestionArea[] = Object.values(AREA_BY_QUESTION);
/** Whether `name` is one of the six areas a question names, as Jev's `area` choice is read (2026-10-28-004). */
export function isQuestionArea(name: string): name is QuestionArea {
  return (QUESTION_AREAS as readonly string[]).includes(name);
}
/** The nine typed questions in the order the skill page lists them: the three of the shape, then the six risk questions. */
export const ROUTE_QUESTIONS: readonly (keyof RouteJudgement)[] = [
  "work_type",
  "is_vague",
  "scope",
  ...RISK_QUESTIONS,
];
const TIGHTENED_TO_FIX: readonly WorkType[] = ["feature", "refactor", "chore"];

/**
 * The session's answers tightened by Jev's (D-1 of 2026-10-28-004), each rule alone and only where
 * it tightens: a risk noul at or above the policy's threshold where the session's is under 0.3 takes
 * Jev's value (the area joins at the route); a scope whose rounded score is above the session's,
 * with the score's confidence at or above the threshold, takes the rounded level; a vagueness at or
 * above the threshold where the session's is under 0.5 takes Jev's value; a `fix` with confidence at
 * or above the threshold where the session said feature, refactor or chore makes the type `fix`. A
 * lower value, a `feature` over a `fix`, a question, an audit, a new product or a confidence under
 * the threshold change nothing. Each change carries its reason with the session's value.
 */
export function tightenAnswers(
  answers: Answers,
  judgement: RouteJudgement,
  policy: Policy,
): { answers: Answers; changes: string[] } {
  const threshold = policy.verify.threshold;
  const adjusted: Answers = { ...answers };
  const changes: string[] = [];
  for (const id of RISK_QUESTIONS) {
    const j = judgement[id];
    if (j >= threshold && answers[id] < RISK_THRESHOLD) {
      adjusted[id] = j;
      changes.push(`${id} ${two(j)} (the session's ${two(answers[id])})`);
    }
  }
  const level = Math.min(Math.round(judgement.scope.score), QUESTIONS.scope.criteria.length - 1);
  if (level > answers.scope && judgement.scope.confidence >= threshold) {
    adjusted.scope = level;
    changes.push(`scope ${level} (the session's ${answers.scope})`);
  }
  if (judgement.is_vague >= threshold && answers.is_vague < VAGUE_THRESHOLD) {
    adjusted.is_vague = judgement.is_vague;
    changes.push(`is_vague ${two(judgement.is_vague)} (the session's ${two(answers.is_vague)})`);
  }
  if (
    judgement.work_type.choice === "fix" &&
    judgement.work_type.confidence >= threshold &&
    TIGHTENED_TO_FIX.includes(answers.work_type)
  ) {
    adjusted.work_type = "fix";
    changes.push(`work_type fix (the session's ${answers.work_type})`);
  }
  return { answers: adjusted, changes };
}

export function validateAnswers(raw: unknown): Answers {
  const problems: string[] = [];
  if (typeof raw !== "object" || raw === null) throw new AnswerError(["answers must be an object"]);
  const input = raw as Record<string, unknown>;
  for (const [id, question] of Object.entries(QUESTIONS)) {
    const value = input[id];
    if (OPTIONAL.has(id) && value === undefined) continue;
    if (question.type === "choice") {
      if (typeof value !== "string" || !(value in question.criteria)) {
        problems.push(`${id}: expected one of ${Object.keys(question.criteria).join(", ")}`);
      }
    } else if (question.type === "noul") {
      if (typeof value !== "number" || value < 0 || value > 1) {
        problems.push(`${id}: expected a probability between 0 and 1`);
      }
    } else if (
      !Number.isInteger(value) ||
      (value as number) < 0 ||
      (value as number) >= question.criteria.length
    ) {
      problems.push(`${id}: expected an integer level from 0 to ${question.criteria.length - 1}`);
    }
  }
  // A kind never takes an issue's or a new project's guards away (rule 11): the type's kinds are fixed.
  if (input.kind !== undefined && !problems.some((p) => p.startsWith("kind:"))) {
    if (input.work_type === "fix" && input.kind !== "issue")
      problems.push("kind: a fix is an issue");
    if (input.work_type === "new-product" && input.kind !== "new-project")
      problems.push("kind: a new product is a new project");
    // An audit's four phases and its signature are reached by its type alone (SP8).
    if (input.work_type === "audit" && input.kind !== "audit")
      problems.push("kind: an audit is an audit");
    if (input.work_type !== "audit" && input.kind === "audit")
      problems.push("kind: an audit is work_type audit");
  }
  if (problems.length) throw new AnswerError(problems);
  return input as unknown as Answers;
}

/** What the engine knows of a request's channel when it derives the kind: a mail origin, a source (SP3 Task 3). */
export interface KindContext {
  origin: boolean;
  sourceChannel: "task-manager" | "document" | null;
}

/**
 * The kind of work (SP7 §7.1) and where it came from: the type's kinds first (a fix is an issue, a new
 * product a new project, whatever the channel), then the answer where the type leaves it open, then
 * the channel (an origin message, a source), else a feature.
 */
export function kindOf(answers: Answers, context: KindContext): { kind: WorkKind; from: string } {
  if (answers.work_type === "fix") return { kind: "issue", from: "work_type fix" };
  if (answers.work_type === "new-product")
    return { kind: "new-project", from: "work_type new-product" };
  if (answers.work_type === "audit") return { kind: "audit", from: "work_type audit" };
  if (answers.kind !== undefined) return { kind: answers.kind, from: "answer" };
  if (context.origin) return { kind: "cross-project", from: "origin" };
  if (context.sourceChannel)
    return { kind: "client-request", from: `source: ${context.sourceChannel}` };
  return { kind: "feature", from: `work_type ${answers.work_type}` };
}

export function riskAreasFromAnswers(answers: Answers): RiskArea[] {
  const areas: RiskArea[] = [];
  for (const [id, area] of Object.entries(AREA_BY_QUESTION) as [QuestionId, RiskArea][]) {
    if ((answers[id] as number) >= RISK_THRESHOLD) areas.push(area);
  }
  return areas;
}

/**
 * The auth area's session patterns, named once: a session store by its name (case is ignored), a
 * session folder, a `...Session.php` middleware; the ones a Claude Code event hook trips (findings 1, 14).
 */
const SESSION_NAME_RISK_PATHS = ["**/session*", "**/*Session.*"];
const SESSION_RISK_PATHS = [...SESSION_NAME_RISK_PATHS, "**/session*/**"];

export const DEFAULT_RISK_PATHS: Record<RiskArea, string[]> = {
  auth: [
    "**/auth/**",
    "**/*auth*",
    "**/Middleware/Authenticate*",
    "**/login*",
    ...SESSION_RISK_PATHS,
    "**/password*",
    "**/oauth*",
    "**/jwt*",
  ],
  payments: [
    "**/payment*",
    "**/billing*",
    "**/checkout*",
    "**/stripe*",
    "**/invoice*",
    "**/pricing*",
  ],
  "personal-data": ["**/gdpr*", "**/privacy*", "**/consent*", "**/pii*", "**/*personal*"],
  "data-migration": ["**/migrations/**", "**/migrate*", "**/schema.*", "**/*.sql", "**/prisma/**"],
  infra: [
    ".github/workflows/**",
    ".gitlab-ci.yml",
    "**/Dockerfile*",
    "**/docker-compose*",
    "**/terraform/**",
    "**/*.tf",
    "**/k8s/**",
    "**/helm/**",
    "**/deploy*",
    "**/ansible/**",
  ],
  "public-api": [
    "**/routes/api*",
    "**/openapi*",
    "**/swagger*",
    "**/*.proto",
    "**/graphql/schema*",
  ],
  secrets: [".env*", "**/.env*", "**/secrets*", "**/*.pem", "**/*.key", "**/credentials*"],
};

/**
 * The personal-data identifiers (finding 149), each as the word sequences that spell it once an
 * identifier is split on its separators and camelCase edges: `userEmail` is `user email`,
 * `iPhone` is `i phone`, so `email` and `phone` hit while `emailed` and `microphone` do not.
 */
const PERSONAL_DATA_TERMS: [string, string[][]][] = [
  ["email", [["email"], ["e", "mail"]]],
  ["password", [["password"], ["passwd"]]],
  ["phone", [["phone"], ["telephone"], ["mobile", "number"], ["mobile", "phone"]]],
  ["birth date", [["date", "of", "birth"], ["birth", "date"], ["birthday"], ["dob"]]],
  ["iban", [["iban"], ["bic"], ["swift", "code"]]],
  ["card", [["card", "number"], ["credit", "card"], ["cvv"], ["cvc"]]],
  ["national id", [["national", "id"]]],
  ["tax id", [["tax", "id"]]],
  ["passport", [["passport"]]],
  ["ssn", [["ssn"], ["social", "security"]]],
];

/** The words of a line: identifiers split on non-letters and on camelCase edges, lower-cased. */
function wordsOf(line: string): string[] {
  return line
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function holds(words: readonly string[], sequence: readonly string[]): boolean {
  for (let i = 0; i + sequence.length <= words.length; i++)
    if (sequence.every((w, n) => words[i + n] === w)) return true;
  return false;
}

/** A personal-data identifier an added line names, and the file it is in (finding 149). */
export type PersonalDataHit = { term: string; file: string };

/** The file a `+++` header names, or null for `/dev/null`; a quoted path loses its quotes. */
function headerFile(rest: string): string | null {
  let path = rest.trim();
  if (path === "/dev/null") return null;
  if (path.startsWith('"') && path.endsWith('"')) path = path.slice(1, -1);
  return path.startsWith("b/") ? path.slice(2) : path;
}

/**
 * The personal-data identifiers the added lines of a unified diff name, once per term and file
 * (finding 149): only `+` lines are read, never the `+++` header, a removed line or a context line;
 * a note line (`# outside git, ...`) or an empty patch names none.
 */
export function personalDataTerms(patch: string): PersonalDataHit[] {
  const hits: PersonalDataHit[] = [];
  const removed = removedLines(patch);
  for (const { file, line } of hunkLines(patch)) {
    if (!line.startsWith("+")) continue;
    // A moved line (finding 180): the same text removed in this file is a reflow's line (a bundle,
    // a formatter's pass, a block moved), not the change's content.
    if (removed.get(file)?.has(line.slice(1))) continue;
    const words = wordsOf(line.slice(1));
    for (const [term, spellings] of PERSONAL_DATA_TERMS) {
      if (hits.some((h) => h.term === term && h.file === file)) continue;
      if (spellings.some((s) => holds(words, s))) hits.push({ term, file });
    }
  }
  return hits;
}

/**
 * The lines inside the hunks of a unified diff, each with its file: a `+++` line is a header only
 * between a `diff --git` line and its first `@@` hunk, so inside a hunk it is a line and a change
 * cannot name another file for its own lines (security review of finding 149); a section with no
 * `+++` header (a binary file) ends the previous file.
 */
function* hunkLines(patch: string): Generator<{ file: string; line: string }> {
  let file: string | null = null;
  let inHunk = false;
  for (const line of patch.split("\n")) {
    if (line.startsWith("diff --git ")) {
      file = null;
      inHunk = false;
      continue;
    }
    if (line.startsWith("@@")) {
      inHunk = true;
      continue;
    }
    if (!inHunk && line.startsWith("+++ ")) {
      file = headerFile(line.slice(4));
      continue;
    }
    if (inHunk && file) yield { file, line };
  }
}

/** The removed lines' texts per file (finding 180), read for the moved-line rule and for nothing else. */
function removedLines(patch: string): Map<string, Set<string>> {
  const removed = new Map<string, Set<string>>();
  for (const { file, line } of hunkLines(patch)) {
    if (!line.startsWith("-")) continue;
    const texts = removed.get(file) ?? new Set<string>();
    texts.add(line.slice(1));
    removed.set(file, texts);
  }
  return removed;
}

function riskPatterns(area: RiskArea, policy: Policy): string[] {
  return [...DEFAULT_RISK_PATHS[area], ...(policy.riskPaths[area] ?? [])];
}

// The session patterns that read a file's name, which an event hook's name trips; the folder form
// (`**/session*/**`) still counts, so a hook inside a session folder stays auth (security review).
const SESSION_NAME_PATTERNS = new Set(SESSION_NAME_RISK_PATHS);
// A Claude Code event hook: `session-start` or `session-end`, any casing, in a hooks/ folder.
const EVENT_HOOK =
  /(?:^|\/)hooks\/(?:[^/]+\/)*(?:session[-_]?(?:start|end)|Session(?:Start|End))\.[^/]+$/i;

/**
 * Whether a path falls in a risk area: one of its patterns matches, the session patterns excepted
 * for a Claude Code event hook (findings 1, 14), whose other patterns still count. The engine's
 * rule, not a policy list: `riskPathExclusions` neither undoes nor replaces it.
 */
function inArea(path: string, area: RiskArea, policy: Policy): boolean {
  const patterns = riskPatterns(area, policy);
  if (area !== "auth" || !EVENT_HOOK.test(path)) return matchesAny(path, patterns);
  return matchesAny(
    path,
    patterns.filter((p) => !SESSION_NAME_PATTERNS.has(p)),
  );
}

function isExcluded(path: string, policy: Policy): boolean {
  return matchesAny(path, policy.riskPathExclusions);
}

/**
 * The personal-data hits of a change's lines split by whether they may raise the risk (finding 149):
 * a test file's or an excluded path's are kept apart, to be named, never to raise.
 */
export function personalDataRisk(
  hits: readonly PersonalDataHit[],
  policy: Policy,
): { read: PersonalDataHit[]; unread: PersonalDataHit[] } {
  const unread = hits.filter((h) => isTestPath(h.file) || isExcluded(h.file, policy));
  return { read: hits.filter((h) => !unread.includes(h)), unread };
}

/** The risk areas the changed paths touch, less the paths the team policy excludes (ADR 0003). */
export function riskAreasForPaths(paths: readonly string[], policy: Policy): RiskArea[] {
  const kept = paths.filter((path) => !isExcluded(path, policy));
  const areas: RiskArea[] = [];
  for (const area of Object.keys(DEFAULT_RISK_PATHS) as RiskArea[])
    if (kept.some((path) => inArea(path, area, policy))) areas.push(area);
  return areas;
}

/**
 * The changed paths an exclusion kept from raising a risk area: excluded, and matching a risk
 * pattern. The record names them, so the loosening is never silent.
 */
export function excludedRiskPaths(paths: readonly string[], policy: Policy): string[] {
  const areas = Object.keys(DEFAULT_RISK_PATHS) as RiskArea[];
  return paths.filter(
    (path) => isExcluded(path, policy) && areas.some((area) => inArea(path, area, policy)),
  );
}

export function routeRank(route: Route): number {
  return ROUTE_ORDER.indexOf(route);
}

export function higherRoute(a: Route, b: Route): Route {
  return routeRank(a) >= routeRank(b) ? a : b;
}

export interface RouteDecision {
  route: Route;
  reasons: string[];
  riskAreas: RiskArea[];
}

export function computeRoute(
  answers: Answers,
  pathRisk: RiskArea[],
  policy: Policy,
): RouteDecision {
  const riskAreas = [...new Set([...riskAreasFromAnswers(answers), ...pathRisk])];
  const reasons: string[] = [];
  let route: Route;
  if (answers.work_type === "new-product") {
    route = "full";
    reasons.push("new product");
  } else if (riskAreas.length > 0) {
    route = "full";
    reasons.push(`risk areas: ${riskAreas.join(", ")}`);
  } else if (
    (answers.work_type === "fix" || answers.work_type === "chore") &&
    answers.is_vague < VAGUE_THRESHOLD &&
    answers.scope === 0
  ) {
    route = "fast";
    reasons.push(`${answers.work_type} in one spot, clear request, no risk area`);
  } else {
    route = "standard";
    reasons.push(
      `${answers.work_type}, scope level ${answers.scope}, ${
        answers.is_vague >= VAGUE_THRESHOLD ? "vague request" : "clear request"
      }`,
    );
  }
  if (routeRank(policy.minimumRoute) > routeRank(route)) {
    route = policy.minimumRoute;
    reasons.push(`team policy minimum: ${policy.minimumRoute}`);
  }
  return { route, reasons, riskAreas };
}
