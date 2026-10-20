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
  VerifyAsk,
  VerifyPolicy,
} from "./types.ts";
import { GATE_NAMES, isJudgementGateName, isMailType, ROUTE_ORDER, VERIFY_ASKS } from "./types.ts";

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
  continuations: "ask",
};

export const DEFAULT_VERIFY_POLICY: VerifyPolicy = {
  send: "claims",
  maxClaimsPerItem: 50,
  threshold: 0.8,
  asks: [...VERIFY_ASKS],
};

/** The verify block key by key (SP3 decision 9): a value out of its range, or an unknown name, falls back alone. */
function loadVerifyPolicy(raw: unknown): VerifyPolicy {
  const v = (typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw : {}) as Record<
    string,
    unknown
  >;
  const threshold =
    typeof v.threshold === "number" && v.threshold >= 0.5 && v.threshold <= 0.99
      ? v.threshold
      : DEFAULT_VERIFY_POLICY.threshold;
  const asks = Array.isArray(v.asks)
    ? v.asks.filter((a): a is VerifyAsk => VERIFY_ASKS.includes(a as VerifyAsk))
    : [];
  return {
    send: v.send === "claims-and-snippets" ? "claims-and-snippets" : "claims",
    maxClaimsPerItem: bounded(
      v.maxClaimsPerItem,
      RANGES.maxClaimsPerItem,
      DEFAULT_VERIFY_POLICY.maxClaimsPerItem,
    ),
    threshold,
    asks: asks.length ? asks : [...DEFAULT_VERIFY_POLICY.asks],
  };
}

export const DEFAULT_POLICY: Policy = {
  requiredGates: [],
  judgementGates: [],
  riskPaths: {},
  riskPathExclusions: [],
  minimumRoute: "fast",
  // Gates are mandatory: a tdd step may be skipped (the observed kind is the better path), a gate
  // only when a person lists it here (0.3.0; finding 20). The e2e gate is the one exception by
  // default (SP7b, decision 9): most projects cannot run it yet, and the skip is the user's, recorded.
  allowSkips: ["tdd", "e2e"],
  artifacts: "commit",
  unattendedDecisions: "wait",
  attendedDecisions: "relay",
  mail: DEFAULT_MAIL_POLICY,
  team: DEFAULT_TEAM_POLICY,
  verify: DEFAULT_VERIFY_POLICY,
};

/** How `crew policy set` checks a value: one of a list, a name, or a whole number in a range. */
type Settable =
  | { values: readonly string[] }
  | { pattern: RegExp; hint: string }
  | { integer: { min: number; max: number } }
  /** A number with at most two decimals inside its range (SP3 Task 6: the verify threshold). */
  | { decimal: { min: number; max: number } }
  /** A comma-separated non-empty subset of the names, written as a list (SP3 Task 6: the verify asks). */
  | { subset: readonly string[] };

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
  // The claims one item may send to Jev in one ask (SP3 decision 9).
  maxClaimsPerItem: { min: 1, max: 200 },
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
  "team.template": {
    pattern: /^[a-z][a-z0-9-]*$/,
    hint: "core or a pack's template name (a lowercase word)",
  },
  "team.maxExperts": { integer: RANGES.maxExperts },
  "team.maxValidationRounds": { integer: RANGES.maxValidationRounds },
  "team.maxJudgementRounds": { integer: RANGES.maxJudgementRounds },
  "team.maxGateRounds": { integer: RANGES.maxGateRounds },
  "team.continuations": { values: ["ask", "granted"] },
  "verify.send": { values: ["claims", "claims-and-snippets"] },
  "verify.maxClaimsPerItem": { integer: RANGES.maxClaimsPerItem },
  "verify.threshold": { decimal: { min: 0.5, max: 0.99 } },
  "verify.asks": { subset: VERIFY_ASKS },
};

function policyPath(paths: CrewPaths): string {
  return join(paths.crewDir, "policy.json");
}

function checkSettable(
  key: string,
  rule: Settable,
  value: string,
): string | number | string[] | { refused: string } {
  if ("decimal" in rule) {
    const { min, max } = rule.decimal;
    const n = Number(value);
    return /^\d+(?:\.\d{1,2})?$/.test(value) && n >= min && n <= max
      ? n
      : {
          refused: `${key} is a number from ${min} to ${max} with at most two decimals, not ${value}`,
        };
  }
  if ("subset" in rule) {
    const names = value
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);
    const unknown = names.filter((n) => !rule.subset.includes(n));
    return names.length && !unknown.length
      ? [...new Set(names)]
      : {
          refused: `${key} is a comma-separated subset of ${rule.subset.join(", ")}, not ${value || "nothing"}`,
        };
  }
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
  if (typeof checked === "object" && !Array.isArray(checked)) return checked;
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
    // A lowercase word as written (SP6 Task 2): `core`, or a pack's template checked where it is read.
    template:
      typeof t.template === "string" && /^[a-z][a-z0-9-]*$/.test(t.template) ? t.template : "core",
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
    continuations: t.continuations === "granted" ? "granted" : "ask",
  };
}

/**
 * A policy can only tighten, with two exceptions: `riskPathExclusions` takes paths out of the risk
 * patterns (ADR 0003), and `team.continuations: granted` lets rounds past a cap run as the user's
 * standing grant, up to the cap plus two (SP7b decision 15). Anything it does not say falls back
 * to the default.
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
      verify: loadVerifyPolicy(raw.verify),
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
