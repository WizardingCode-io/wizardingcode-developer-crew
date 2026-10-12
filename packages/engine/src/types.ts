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

export interface Approval {
  what: "spec";
  at: string;
}

export interface Skip {
  /** `tdd:<criterion id>`, `gate:<gate name>` or a phase name. */
  step: string;
  reason: string;
  at: string;
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
  approvals: Approval[];
  skips: Skip[];
  /** HEAD when the item started; the change is everything since. Null outside git or with no commits. */
  baseCommit: string | null;
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
}

export type Mode = "partner" | "guide" | "pilot";
export interface UserConfig {
  mode: Mode;
  decisions: { log: boolean };
}
