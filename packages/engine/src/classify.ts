import { matchesAny } from "./glob.ts";
import type { MailPriority, Policy, RiskArea, Route, WorkKind, WorkType } from "./types.ts";
import { ROUTE_ORDER } from "./types.ts";

export type QuestionType = "choice" | "noul" | "score";
export interface Question {
  type: QuestionType;
  instructions: string;
  criteria?: Record<string, string> | string[];
}

const WORK_TYPES: Record<WorkType, string> = {
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
  if (answers.kind !== undefined) return { kind: answers.kind, from: "answer" };
  if (context.origin) return { kind: "cross-project", from: "origin" };
  if (context.sourceChannel)
    return { kind: "client-request", from: `source: ${context.sourceChannel}` };
  return { kind: "feature", from: `work_type ${answers.work_type}` };
}

const AREA_BY_QUESTION: Partial<Record<QuestionId, RiskArea>> = {
  touches_auth: "auth",
  touches_payments: "payments",
  touches_personal_data: "personal-data",
  touches_data_migration: "data-migration",
  touches_infra: "infra",
  touches_public_api: "public-api",
};

export function riskAreasFromAnswers(answers: Answers): RiskArea[] {
  const areas: RiskArea[] = [];
  for (const [id, area] of Object.entries(AREA_BY_QUESTION) as [QuestionId, RiskArea][]) {
    if ((answers[id] as number) >= RISK_THRESHOLD) areas.push(area);
  }
  return areas;
}

export const DEFAULT_RISK_PATHS: Record<RiskArea, string[]> = {
  auth: [
    "**/auth/**",
    "**/*auth*",
    "**/Middleware/Authenticate*",
    "**/login*",
    "**/session*",
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

function riskPatterns(area: RiskArea, policy: Policy): string[] {
  return [...DEFAULT_RISK_PATHS[area], ...(policy.riskPaths[area] ?? [])];
}

function isExcluded(path: string, policy: Policy): boolean {
  return matchesAny(path, policy.riskPathExclusions);
}

/** The risk areas the changed paths touch, less the paths the team policy excludes (ADR 0003). */
export function riskAreasForPaths(paths: readonly string[], policy: Policy): RiskArea[] {
  const kept = paths.filter((path) => !isExcluded(path, policy));
  const areas: RiskArea[] = [];
  for (const area of Object.keys(DEFAULT_RISK_PATHS) as RiskArea[]) {
    const patterns = riskPatterns(area, policy);
    if (kept.some((path) => matchesAny(path, patterns))) areas.push(area);
  }
  return areas;
}

/**
 * The changed paths an exclusion kept from raising a risk area: excluded, and matching a risk
 * pattern. The record names them, so the loosening is never silent.
 */
export function excludedRiskPaths(paths: readonly string[], policy: Policy): string[] {
  const areas = Object.keys(DEFAULT_RISK_PATHS) as RiskArea[];
  return paths.filter(
    (path) =>
      isExcluded(path, policy) &&
      areas.some((area) => matchesAny(path, riskPatterns(area, policy))),
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
