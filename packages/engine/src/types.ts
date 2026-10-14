export type GateName = "build" | "test" | "lint" | "typecheck" | "secrets" | "deps";
export const GATE_NAMES: readonly GateName[] = [
  "build",
  "test",
  "lint",
  "typecheck",
  "secrets",
  "deps",
];

export type CommandSource = "detected" | "proposed" | "confirmed";
export interface GateCommand {
  command: string;
  source: CommandSource;
}

/** 'other' is a target a person configured by hand, on a stack no detector knows. */
export type Stack = "node" | "php" | "python" | "other";

export interface Target {
  /** Path relative to the repository root; '.' for the root itself. */
  path: string;
  stack: Stack;
  packageManager: string;
  gates: Partial<Record<GateName, GateCommand>>;
  timeoutMs: number;
  /** The target whose manifest lists this folder as a workspace; its gates cover the ones this target does not define. */
  workspaceOf?: string;
}

export interface Profile {
  version: 1;
  detectedAt: string;
  targets: Target[];
  watch: { exclude: string[] };
}

export type Route = "fast" | "standard" | "full";
export const ROUTE_ORDER: readonly Route[] = ["fast", "standard", "full"];

export type WorkType = "fix" | "feature" | "refactor" | "chore" | "new-product" | "question";

export type Phase =
  | "receive"
  | "recognize"
  | "understand"
  | "specify"
  | "plan"
  | "build"
  | "gate"
  | "deliver";
export const PHASE_ORDER: readonly Phase[] = [
  "receive",
  "recognize",
  "understand",
  "specify",
  "plan",
  "build",
  "gate",
  "deliver",
];

export type RiskArea =
  | "auth"
  | "payments"
  | "personal-data"
  | "data-migration"
  | "infra"
  | "public-api"
  | "secrets";

export type CriterionKind = "behavior" | "preserve";
export interface Criterion {
  id: string;
  kind: CriterionKind;
  text: string;
}

/** A criterion taken out while no test-first record or skip named it. Its number is never reused. */
export interface RemovedCriterion extends Criterion {
  at: string;
}

/** A turn that ended waiting for the user while the work was not proven, and the first reason why. */
export interface Pause {
  at: string;
  reason: string;
}

/**
 * Claude Code's permission modes. A user-only decision the agent takes with no person watching
 * (a headless session in any mode, or `bypassPermissions` and `dontAsk`, which show no prompt)
 * records the mode it was taken in.
 */
export type PermissionMode =
  | "default"
  | "acceptEdits"
  | "plan"
  | "auto"
  | "bypassPermissions"
  | "dontAsk";
export const PERMISSION_MODES: readonly PermissionMode[] = [
  "default",
  "acceptEdits",
  "plan",
  "auto",
  "bypassPermissions",
  "dontAsk",
];
export function isPermissionMode(value: unknown): value is PermissionMode {
  return PERMISSION_MODES.includes(value as PermissionMode);
}

export type DecidedBy = "user" | "agent";
/** Who took a user-only decision; `mode` is set when the agent took it with no person watching. */
export interface Decision {
  by: DecidedBy;
  mode?: PermissionMode;
}

export interface Approval {
  what: "spec";
  at: string;
  /** Absent in records written before 0.1.2, which read as the user's. */
  by?: DecidedBy;
  mode?: PermissionMode;
}

export interface Skip {
  /** `tdd:<criterion id>`, `gate:<gate name>` or a phase name. */
  step: string;
  reason: string;
  at: string;
  by?: DecidedBy;
  mode?: PermissionMode;
}

export interface WorkItem {
  id: string;
  title: string;
  input: string;
  type: WorkType;
  route: Route;
  routeReasons: string[];
  riskAreas: RiskArea[];
  phase: Phase;
  awaiting: "user" | null;
  criteria: Criterion[];
  /** Absent in records written before 0.1.4. */
  removedCriteria?: RemovedCriterion[];
  /** Turns that ended waiting for the user while the work was not proven. Absent before 0.1.4. */
  pauses?: Pause[];
  approvals: Approval[];
  skips: Skip[];
  /** HEAD when the item started; the change is everything since. Null outside git or with no commits. */
  baseCommit: string | null;
  /**
   * Content hashes of the watched paths that already differed from baseCommit when the item
   * started: the proven work of an earlier item, left uncommitted. A path whose content still
   * matches is not this item's change.
   */
  baseFiles?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface RunRecord {
  command: string;
  exit: number | null;
  at: string;
  durationMs: number;
  /** Path of the full log, relative to the work folder. */
  log: string;
  tail: string;
  timedOut: boolean;
  changedTests?: string[];
}

export interface TddRecord {
  criterion: string;
  red?: RunRecord;
  green?: RunRecord;
  before?: RunRecord;
  after?: RunRecord;
}

export type GateStatus = "pass" | "fail" | "skipped" | "unavailable";

export interface GateRun {
  gate: GateName;
  target: string;
  /** Set when the target's path holds more than one target; the stack then names which one ran. */
  stack?: Stack;
  command: string | null;
  commandSource: CommandSource | null;
  confirmed: boolean;
  exit: number | null;
  status: GateStatus;
  durationMs: number;
  at: string;
  log: string | null;
  tail: string;
  reason?: string;
  /** The fingerprint of the code this run vouches for; a run on other code counts as not run. */
  fingerprint: string;
}

export interface Evidence {
  fingerprint: string | null;
  tdd: TddRecord[];
  runs: GateRun[];
  verdict: "proven" | "unproven";
  unproven: string[];
}

export interface Policy {
  requiredGates: GateName[];
  riskPaths: Partial<Record<RiskArea, string[]>>;
  minimumRoute: Route;
  /** Steps the user may skip. `['*']` means any. */
  allowSkips: string[];
  artifacts: "commit" | "local";
  /**
   * What an approval or skip taken by the agent with no person watching is worth: `wait` records
   * it but the guard and the verdict still wait for a person; `count` lets it count.
   */
  unattendedDecisions: "wait" | "count";
}

export type Mode = "partner" | "guide" | "pilot";
export interface UserConfig {
  mode: Mode;
  decisions: { log: boolean };
}
