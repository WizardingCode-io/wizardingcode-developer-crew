import { join } from "node:path";
import type { CrewPaths } from "./paths.ts";
import { readProtectedJson, writeProtectedJson } from "./store.ts";
import { TEAMS } from "./team.ts";
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
  UiPolicy,
  VerifyAsk,
  VerifyPolicy,
} from "./types.ts";
import { GATE_NAMES, isJudgementGateName, isMailType, ROUTE_ORDER, VERIFY_ASKS } from "./types.ts";

export const MAIL_NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/;
/** A lowercase word: a template's name, a pack's stack or knowledge key; one spelling for the policy and the packs. */
export const LOWERCASE_WORD = /^[a-z][a-z0-9-]*$/;
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
  // Gates are mandatory: a gate is skipped only when a person lists it here (0.3.0; finding 20). The
  // e2e gate is the one exception by default (SP7b, decision 9): most projects cannot run it yet, and
  // the skip is the user's, recorded. A test-first step is not skipped by default either (finding
  // 164, ADR 0014): a red is traced to its origin; a team that wants the skip lists `tdd` by hand.
  allowSkips: ["e2e"],
  artifacts: "commit",
  unattendedDecisions: "wait",
  unattendedPolicyChanges: "never",
  attendedDecisions: "relay",
  // A copy: a caller that changes the default policy's mail block leaves the mail defaults as they are.
  mail: { ...DEFAULT_MAIL_POLICY, accept: [...DEFAULT_MAIL_POLICY.accept] },
  // Copies, as the mail block is: a caller that changes the default policy's team or verify block
  // leaves DEFAULT_TEAM_POLICY and DEFAULT_VERIFY_POLICY as they are (triage 6b).
  team: {
    ...DEFAULT_TEAM_POLICY,
    always: [...DEFAULT_TEAM_POLICY.always],
    specialists: [...DEFAULT_TEAM_POLICY.specialists],
  },
  verify: { ...DEFAULT_VERIFY_POLICY, asks: [...DEFAULT_VERIFY_POLICY.asks] },
  // The design lint's disabled rules (SP9 Task 6): a hand-written list, empty by default.
  ui: { lint: { disabled: [] } },
};

/** How `crew policy set` checks a value: one of a list, a name, or a whole number in a range. */
type Settable =
  | { values: readonly string[] }
  | { pattern: RegExp; hint: string }
  | { integer: { min: number; max: number } }
  /** A number with at most two decimals inside its range (SP3 Task 6: the verify threshold). */
  | { decimal: { min: number; max: number } }
  /** A comma-separated non-empty subset of the names, written as a list (SP3 Task 6: the verify asks). */
  | { subset: readonly string[] }
  /** A list the command changes one element at a time, each checked by shape (finding 120: the exclusions). */
  | { list: { pattern: RegExp; hint: string } };

/** What a mail name is, said the same by the policy and the commands that refuse one. */
export const NAME_HINT =
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

/**
 * One exclusion glob: relative to the repository (no leading `/` or `./`, since the matcher strips
 * `./` from the path and not from the pattern), no `..` segment, no whitespace or backslash, up to
 * 200 characters, and at least one literal character outside `*`, `?` and `/`: `**` alone would
 * match every path and turn the risk route off for the whole project with one command.
 */
const EXCLUSION_GLOB = /^(?!\.?\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?=.*[^*?/])[^\s\\]{1,200}$/;
const EXCLUSION_HINT =
  "a relative glob of the repository with at least one literal character: no leading slash or ./, no .. segment, no whitespace or backslash, up to 200 characters";

/** The scalar keys `crew policy set` writes, and the one list it changes an element at a time (finding 120); the other lists (`mail.accept`, `allowSkips`, …) are hand-written and accepted. */
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
    pattern: LOWERCASE_WORD,
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
  // Who may change the policy where nobody watches (finding 122, ADR 0012): a person's key alone.
  unattendedPolicyChanges: { values: ["never", "validator"] },
  // The one loosening a policy may carry (ADR 0003), one glob per command, added or removed (finding 120).
  // Appended last: the messages that enumerate the table keep their first keys.
  riskPathExclusions: { list: { pattern: EXCLUSION_GLOB, hint: EXCLUSION_HINT } },
};

/** The validator's rule for a policy change where nobody watches (ADR 0012), named once. */
export const POLICY_CHANGE_RULE = "policy-change";

/**
 * The caps the validator may lower where nobody watches, under `unattendedPolicyChanges: validator`
 * (finding 122, ADR 0012): a lower cap only makes the crew stop sooner and wait for a person; it
 * passes nothing. Every other key, a key added later included, is a person's.
 */
export const UNATTENDED_LOWERINGS = [
  "team.maxJudgementRounds",
  "team.maxValidationRounds",
  "team.maxGateRounds",
  "mail.maxConcurrent",
  "mail.maxHops",
  "mail.maxTurns",
  "mail.maxMinutes",
  "mail.maxParties",
] as const;

/** A cap's value in the policy as read: `team.maxGateRounds` is `policy.team.maxGateRounds`. */
function capValue(policy: Policy, key: (typeof UNATTENDED_LOWERINGS)[number]): number {
  const [block, name] = key.split(".") as ["team" | "mail", string];
  return (policy[block] as unknown as Record<string, number>)[name] as number;
}

/**
 * Whether the validator may make this policy change where nobody watches (finding 122, ADR 0012),
 * one answer for the PreToolUse hook and the command: the policy says `validator`, the rule is
 * `policy-change`, no `--remove`, the key is one of `UNATTENDED_LOWERINGS`, and the value passes
 * the table and is lower than the current one. The change with its old value, or why not.
 */
export function unattendedPolicyChange(
  policy: Policy,
  key: string,
  value: string,
  flags: { rule: unknown; remove: boolean },
): { key: string; from: number; to: number } | { refused: string } {
  if (policy.unattendedPolicyChanges !== "validator")
    return { refused: "the policy keeps its changes a person's (unattendedPolicyChanges: never)" };
  if (flags.rule !== POLICY_CHANGE_RULE)
    return {
      refused: `a policy change by the validator names the rule ${POLICY_CHANGE_RULE} (--validator ${POLICY_CHANGE_RULE})`,
    };
  if (flags.remove) return { refused: "--remove is a person's: the validator only lowers a cap" };
  const cap = UNATTENDED_LOWERINGS.find((k) => k === key);
  if (!cap)
    return {
      refused: `${key} is a person's: the validator only lowers ${UNATTENDED_LOWERINGS.join(", ")}`,
    };
  const rule = SETTABLE_POLICY_KEYS[cap] as Settable;
  const checked = checkSettable(cap, rule, value);
  if (isRefusal(checked)) return checked;
  const from = capValue(policy, cap);
  if (typeof checked !== "number" || checked >= from)
    return { refused: `${cap}: ${value} does not lower ${from}; raising a cap is a person's` };
  return { key: cap, from, to: checked };
}

/** The keys of the table `crew policy set … --remove` applies to. */
export const LIST_POLICY_KEYS = Object.entries(SETTABLE_POLICY_KEYS)
  .filter(([, rule]) => "list" in rule)
  .map(([key]) => key);

const TAMPERED_POLICY =
  "state changed outside the engine: .crew/policy.json; the user can accept it with crew policy accept";

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
  // Before the integer fallback: a rule with no branch of its own would be read as an integer.
  if ("list" in rule)
    return rule.list.pattern.test(value)
      ? value
      : { refused: `${key} is ${rule.list.hint}, not ${value}` };
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
  // Own keys only (finding 27): an inherited name such as toString is no policy key.
  const rule = Object.hasOwn(SETTABLE_POLICY_KEYS, key) ? SETTABLE_POLICY_KEYS[key] : undefined;
  if (!rule) {
    return {
      refused: `unknown policy key: ${key} (crew policy set writes ${Object.keys(SETTABLE_POLICY_KEYS).join(", ")})`,
    };
  }
  // A list key goes through planListChange and writeListChange: written here, one glob would
  // replace the whole list with a string.
  if ("list" in rule) {
    return {
      refused: `${key} is a list: crew policy set ${key} "<glob>" adds one glob, --remove takes it out`,
    };
  }
  const checked = checkSettable(key, rule, value);
  if (isRefusal(checked)) return checked;
  const file = readPolicyFile(paths);
  if ("refused" in file) return file;
  const { raw } = file;
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

/** One change of a list key of `policy.json`, decided before anything is recorded or written (finding 120). */
export type ListChange = {
  key: string;
  value: string;
  action: "added" | "removed" | "already listed";
  /** The list as the file will hold it after the change. */
  list: string[];
  raw: Record<string, unknown>;
};

/** The policy file as written, or the refusal a hand edit earns: one reading for every writer. */
function readPolicyFile(paths: CrewPaths): { raw: Record<string, unknown> } | { refused: string } {
  const read = readProtectedJson<Record<string, unknown>>(paths, policyPath(paths));
  if (read.tampered) return { refused: TAMPERED_POLICY };
  return { raw: { ...(read.data ?? {}) } };
}

/** `checkSettable`'s refusal: the one object among its values, since a list is an array. */
function isRefusal(checked: ReturnType<typeof checkSettable>): checked is { refused: string } {
  return typeof checked === "object" && !Array.isArray(checked);
}

/**
 * Reads and checks a list key's change, with or without `--remove`, and returns what the write
 * would do or the refusal. The caller records the user's decision first and writes after
 * (`writeListChange`), so a loosening never exists without its record. A tampered file is refused
 * as for a scalar key; the list is read as the loader reads it (`strings`), so a hand-written value
 * that is not an array, or holds non-strings, is stored cleaned at the next write.
 */
export function planListChange(
  paths: CrewPaths,
  key: string,
  value: string,
  remove: boolean,
): ListChange | { refused: string } {
  const rule = Object.hasOwn(SETTABLE_POLICY_KEYS, key) ? SETTABLE_POLICY_KEYS[key] : undefined;
  if (!rule || !("list" in rule)) {
    return { refused: `${key} is not a list key (${LIST_POLICY_KEYS.join(", ")})` };
  }
  const checked = checkSettable(key, rule, value);
  if (isRefusal(checked)) return checked;
  const file = readPolicyFile(paths);
  if ("refused" in file) return file;
  const { raw } = file;
  const list = strings(raw[key]);
  const listed = list.includes(value);
  if (remove && !listed) {
    const lists = list.length ? `it lists: ${list.join(", ")}` : "it lists nothing";
    return { refused: `${key} does not list ${value} (${lists})` };
  }
  if (remove) return { key, value, action: "removed", list: list.filter((g) => g !== value), raw };
  if (listed) return { key, value, action: "already listed", list, raw };
  return { key, value, action: "added", list: [...list, value], raw };
}

/** Writes the list a `planListChange` decided, the rest of the file kept as written. */
export function writeListChange(paths: CrewPaths, change: ListChange): void {
  writeProtectedJson(paths, policyPath(paths), { ...change.raw, [change.key]: change.list });
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

/** The design lint's block (SP9 Task 6): `ui.lint.disabled` keeps its strings; anything else, or no block, is the empty list. */
function loadUiPolicy(raw: unknown): UiPolicy {
  const ui = (typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw : {}) as Record<
    string,
    unknown
  >;
  const lint = (
    typeof ui.lint === "object" && ui.lint !== null && !Array.isArray(ui.lint) ? ui.lint : {}
  ) as Record<string, unknown>;
  return { lint: { disabled: strings(lint.disabled) } };
}

/** The teams of the registry, named once (`TEAMS`). */
const TEAM_NAMES = Object.keys(TEAMS) as readonly TeamName[];

/** The team block as written, each value checked: an unknown team dropped, a cap outside its range at its default (SP7 §6.1). */
function loadTeamPolicy(raw: unknown): TeamPolicy {
  const t = (typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw : {}) as Record<
    string,
    unknown
  >;
  return {
    // A lowercase word as written (SP6 Task 2): `core`, or a pack's template checked where it is read.
    template:
      typeof t.template === "string" && LOWERCASE_WORD.test(t.template) ? t.template : "core",
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
  // A copy of the default list: a caller that changes its policy's list leaves the default whole.
  const allowSkips = Array.isArray(raw.allowSkips)
    ? strings(raw.allowSkips)
    : [...DEFAULT_POLICY.allowSkips];
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
      unattendedPolicyChanges: raw.unattendedPolicyChanges === "validator" ? "validator" : "never",
      attendedDecisions: raw.attendedDecisions === "prompt" ? "prompt" : "relay",
      mail: loadMailPolicy(raw.mail),
      team: loadTeamPolicy(raw.team),
      verify: loadVerifyPolicy(raw.verify),
      ui: loadUiPolicy(raw.ui),
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
