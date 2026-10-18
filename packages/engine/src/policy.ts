import { join } from "node:path";
import type { CrewPaths } from "./paths.ts";
import { readProtectedJson, writeProtectedJson } from "./store.ts";
import type {
  DecidedBy,
  GateName,
  MailPolicy,
  PermissionMode,
  Policy,
  RiskArea,
  Route,
  TeamName,
  TeamPolicy,
} from "./types.ts";
import { GATE_NAMES, isJudgementGateName, isMailType, ROUTE_ORDER } from "./types.ts";

export const MAIL_NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/;
/** `..` or a relative path of plain segments: where task worktrees go (plan decision 12). */
export const WORKTREES = /^(\.\.|[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*)$/;

export const DEFAULT_MAIL_POLICY: MailPolicy = {
  workspace: null,
  name: null,
  accept: ["question", "notice"],
  open: "read-only",
  maxConcurrent: 2,
  maxHops: 2,
  maxTurns: 40,
  maxMinutes: 30,
  worktrees: "..",
  maxParties: 4,
};

/** The team block's defaults (SP7 §6.1): the core template, no team beyond the route, the caps at their ceilings. */
export const DEFAULT_TEAM_POLICY: TeamPolicy = {
  template: "core",
  always: [],
  specialists: [],
  maxExperts: 3,
  maxValidationRounds: 2,
  maxJudgementRounds: 2,
  maxGateRounds: 2,
};

export const DEFAULT_POLICY: Policy = {
  requiredGates: [],
  judgementGates: [],
  riskPaths: {},
  riskPathExclusions: [],
  minimumRoute: "fast",
  // Gates are mandatory: a tdd step may be skipped (the observed kind is the better path), a gate
  // only when a person lists it here (0.3.0; finding 20).
  allowSkips: ["tdd"],
  artifacts: "commit",
  unattendedDecisions: "wait",
  attendedDecisions: "relay",
  mail: DEFAULT_MAIL_POLICY,
  team: DEFAULT_TEAM_POLICY,
};

/** How `crew policy set` checks a value: one of a list, a name, or a whole number in a range. */
type Settable =
  | { values: readonly string[] }
  | { pattern: RegExp; hint: string }
  | { integer: { min: number; max: number } };

const NAME_HINT =
  "a lowercase name of letters, digits, dot, dash and underscore, up to 64 characters";

type Range = { min: number; max: number };

/** The whole-number limits of the mail policy, named once for the settable table and the reader. */
const RANGES = {
  maxConcurrent: { min: 1, max: 10 },
  maxHops: { min: 1, max: 10 },
  maxTurns: { min: 1, max: 500 },
  maxMinutes: { min: 1, max: 600 },
  // A thread's parties: the default is the ceiling (SP7 §18), so the key only tightens.
  maxParties: { min: 2, max: 4 },
  // The team's caps end at their defaults: a policy can only tighten them (SP7 §6.1).
  maxExperts: { min: 1, max: 3 },
  maxValidationRounds: { min: 1, max: 2 },
  maxJudgementRounds: { min: 1, max: 2 },
  maxGateRounds: { min: 1, max: 2 },
} as const satisfies Record<string, Range>;

/** The scalar keys `crew policy set` writes; the lists (`mail.accept`, `allowSkips`, …) are hand-written and accepted. */
export const SETTABLE_POLICY_KEYS: Record<string, Settable> = {
  attendedDecisions: { values: ["prompt", "relay"] },
  unattendedDecisions: { values: ["wait", "count", "validator"] },
  "mail.workspace": { pattern: MAIL_NAME, hint: NAME_HINT },
  "mail.name": { pattern: MAIL_NAME, hint: NAME_HINT },
  "mail.open": { values: ["read-only", "branch"] },
  "mail.maxConcurrent": { integer: RANGES.maxConcurrent },
  "mail.maxHops": { integer: RANGES.maxHops },
  "mail.maxTurns": { integer: RANGES.maxTurns },
  "mail.maxMinutes": { integer: RANGES.maxMinutes },
  "mail.maxParties": { integer: RANGES.maxParties },
  "mail.worktrees": {
    pattern: WORKTREES,
    hint: "a relative path with no spaces (.. for the folder beside the root)",
  },
  "team.template": { values: ["core"] },
  "team.maxExperts": { integer: RANGES.maxExperts },
  "team.maxValidationRounds": { integer: RANGES.maxValidationRounds },
  "team.maxJudgementRounds": { integer: RANGES.maxJudgementRounds },
  "team.maxGateRounds": { integer: RANGES.maxGateRounds },
};

function policyPath(paths: CrewPaths): string {
  return join(paths.crewDir, "policy.json");
}

function checkSettable(
  key: string,
  rule: Settable,
  value: string,
): string | number | { refused: string } {
  if ("values" in rule)
    return rule.values.includes(value)
      ? value
      : { refused: `${key} is one of ${rule.values.join(", ")}, not ${value}` };
  if ("pattern" in rule)
    return rule.pattern.test(value) ? value : { refused: `${key} is ${rule.hint}, not ${value}` };
  const n = Number(value);
  const { min, max } = rule.integer;
  return /^\d+$/.test(value) && n >= min && n <= max
    ? n
    : { refused: `${key} is a whole number from ${min} to ${max}, not ${value}` };
}

/**
 * Writes one settable key of `policy.json` through the engine: the file keeps everything else as
 * written and stays trusted. A file changed outside the engine is refused until a person accepts it.
 * A dotted key (`mail.workspace`) is written nested, inside its block.
 */
export function setPolicyValue(
  paths: CrewPaths,
  key: string,
  value: string,
): { key: string; value: string } | { refused: string } {
  const rule = SETTABLE_POLICY_KEYS[key];
  if (!rule) {
    return {
      refused: `unknown policy key: ${key} (crew policy set writes ${Object.keys(SETTABLE_POLICY_KEYS).join(", ")})`,
    };
  }
  const checked = checkSettable(key, rule, value);
  if (typeof checked === "object") return checked;
  const read = readProtectedJson<Record<string, unknown>>(paths, policyPath(paths));
  if (read.tampered) {
    return {
      refused:
        "state changed outside the engine: .crew/policy.json; the user can accept it with crew policy accept",
    };
  }
  const raw = { ...(read.data ?? {}) };
  const dot = key.indexOf(".");
  if (dot === -1) raw[key] = checked;
  else {
    const block = raw[key.slice(0, dot)];
    raw[key.slice(0, dot)] = {
      ...(typeof block === "object" && block !== null && !Array.isArray(block) ? block : {}),
      [key.slice(dot + 1)]: checked,
    };
  }
  writeProtectedJson(paths, policyPath(paths), raw);
  return { key, value };
}

function mailName(value: unknown): string | null {
  return typeof value === "string" && MAIL_NAME.test(value) ? value : null;
}

/** A whole number inside its range; the fallback for anything else (a string, a fraction, out of range). */
function bounded(value: unknown, range: Range, fallback: number): number {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= range.min &&
    value <= range.max
    ? value
    : fallback;
}

/** The `mail` block, validated value by value: a name the mailbox folder cannot take is dropped, not folded. */
function loadMailPolicy(raw: unknown): MailPolicy {
  const m = (typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw : {}) as Record<
    string,
    unknown
  >;
  return {
    workspace: mailName(m.workspace),
    name: mailName(m.name),
    accept: Array.isArray(m.accept) ? m.accept.filter(isMailType) : [...DEFAULT_MAIL_POLICY.accept],
    open: m.open === "branch" ? "branch" : "read-only",
    maxConcurrent: bounded(
      m.maxConcurrent,
      RANGES.maxConcurrent,
      DEFAULT_MAIL_POLICY.maxConcurrent,
    ),
    maxHops: bounded(m.maxHops, RANGES.maxHops, DEFAULT_MAIL_POLICY.maxHops),
    maxTurns: bounded(m.maxTurns, RANGES.maxTurns, DEFAULT_MAIL_POLICY.maxTurns),
    maxMinutes: bounded(m.maxMinutes, RANGES.maxMinutes, DEFAULT_MAIL_POLICY.maxMinutes),
    worktrees:
      typeof m.worktrees === "string" && WORKTREES.test(m.worktrees)
        ? m.worktrees
        : DEFAULT_MAIL_POLICY.worktrees,
    maxParties: bounded(m.maxParties, RANGES.maxParties, DEFAULT_MAIL_POLICY.maxParties),
  };
}

/**
 * Whether a recorded decision counts: a person's always; the validator's when a person was present
 * (no mode: the person was there to object) or, with no person watching, as the policy says; the
 * agent's as the policy says.
 */
export function decisionCounts(
  policy: Policy,
  decision: { by?: DecidedBy; mode?: PermissionMode },
): boolean {
  if (decision.by === "validator")
    return decision.mode === undefined || policy.unattendedDecisions === "validator";
  return decision.by !== "agent" || policy.unattendedDecisions === "count";
}

const RISK_AREAS: RiskArea[] = [
  "auth",
  "payments",
  "personal-data",
  "data-migration",
  "infra",
  "public-api",
  "secrets",
];

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

const TEAM_NAMES: readonly TeamName[] = [
  "architects",
  "researchers",
  "etl",
  "security",
  "devops",
  "qa",
  "backend",
  "frontend",
  "agentic-os",
];

/** The team block as written, each value checked: an unknown team dropped, a cap outside its range at its default (SP7 §6.1). */
function loadTeamPolicy(raw: unknown): TeamPolicy {
  const t = (typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw : {}) as Record<
    string,
    unknown
  >;
  return {
    template: "core",
    always: strings(t.always).filter((n): n is TeamName => TEAM_NAMES.includes(n as TeamName)),
    specialists: strings(t.specialists),
    maxExperts: bounded(t.maxExperts, RANGES.maxExperts, DEFAULT_TEAM_POLICY.maxExperts),
    maxValidationRounds: bounded(
      t.maxValidationRounds,
      RANGES.maxValidationRounds,
      DEFAULT_TEAM_POLICY.maxValidationRounds,
    ),
    maxJudgementRounds: bounded(
      t.maxJudgementRounds,
      RANGES.maxJudgementRounds,
      DEFAULT_TEAM_POLICY.maxJudgementRounds,
    ),
    maxGateRounds: bounded(
      t.maxGateRounds,
      RANGES.maxGateRounds,
      DEFAULT_TEAM_POLICY.maxGateRounds,
    ),
  };
}

/**
 * A policy can only tighten, with one exception: `riskPathExclusions` takes paths out of the risk
 * patterns (ADR 0003). Anything it does not say falls back to the default.
 */
export function loadPolicy(paths: CrewPaths): { policy: Policy; tampered: boolean } {
  const read = readProtectedJson<Record<string, unknown>>(paths, policyPath(paths));
  const raw = read.data ?? {};
  const riskPaths: Policy["riskPaths"] = {};
  const rawRisk = (raw.riskPaths ?? {}) as Record<string, unknown>;
  for (const area of RISK_AREAS) {
    const patterns = strings(rawRisk[area]);
    if (patterns.length) riskPaths[area] = patterns;
  }
  const minimumRoute = ROUTE_ORDER.includes(raw.minimumRoute as Route)
    ? (raw.minimumRoute as Route)
    : DEFAULT_POLICY.minimumRoute;
  const allowSkips = Array.isArray(raw.allowSkips)
    ? strings(raw.allowSkips)
    : DEFAULT_POLICY.allowSkips;
  return {
    policy: {
      requiredGates: strings(raw.requiredGates).filter((g): g is GateName =>
        GATE_NAMES.includes(g as GateName),
      ),
      judgementGates: strings(raw.judgementGates).filter(isJudgementGateName),
      riskPaths,
      riskPathExclusions: strings(raw.riskPathExclusions),
      minimumRoute,
      allowSkips,
      artifacts: raw.artifacts === "local" ? "local" : "commit",
      unattendedDecisions:
        raw.unattendedDecisions === "count" || raw.unattendedDecisions === "validator"
          ? raw.unattendedDecisions
          : "wait",
      attendedDecisions: raw.attendedDecisions === "prompt" ? "prompt" : "relay",
      mail: loadMailPolicy(raw.mail),
      team: loadTeamPolicy(raw.team),
    },
    tampered: read.tampered,
  };
}

/** `*` any step; `tdd` any test-first step; otherwise the step itself (`gate:lint`) or its bare name (`lint`). */
export function skipAllowed(policy: Policy, step: string): boolean {
  const bare = step.replace(/^(gate|tdd):/, "");
  return policy.allowSkips.some(
    (s) => s === "*" || s === step || s === bare || (s === "tdd" && step.startsWith("tdd:")),
  );
}
