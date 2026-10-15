export type GateName = "build" | "test" | "lint" | "typecheck" | "secrets" | "deps";
export const GATE_NAMES: readonly GateName[] = [
  "build",
  "test",
  "lint",
  "typecheck",
  "secrets",
  "deps",
];

/**
 * A gate whose verdict is a reviewer's ruling against a rubric and a judge's decision, not an exit
 * code (SP2 §10). Kept apart from `GateName`: the engine runs those, the session's roles run these.
 */
export type JudgementGateName = "code-quality" | "test-quality" | "security" | "ui-ux" | "risk";
export const JUDGEMENT_GATES: readonly JudgementGateName[] = [
  "code-quality",
  "test-quality",
  "security",
  "ui-ux",
  "risk",
];
export function isJudgementGateName(value: unknown): value is JudgementGateName {
  return JUDGEMENT_GATES.includes(value as JudgementGateName);
}

/** A judgement gate the item needs, and why: "standard route", "risk area auth", "interface files: a.vue", "policy". */
export interface PlannedJudgement {
  gate: JudgementGateName;
  reason: string;
}

export type CommandSource = "detected" | "proposed" | "confirmed";
export interface GateCommand {
  command: string;
  source: CommandSource;
  /** This gate's own time limit; without it the target's applies, with a twenty-minute floor for `test`. */
  timeoutMs?: number;
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

/** The four kinds of mail (vision §10). */
export type MailType = "question" | "change-request" | "notice" | "blocker";
export const MAIL_TYPES: readonly MailType[] = ["question", "change-request", "notice", "blocker"];
export function isMailType(value: unknown): value is MailType {
  return MAIL_TYPES.includes(value as MailType);
}

/** What happened to a message, as the receiving engine last recorded it. */
export type MailStatus =
  | "sent"
  | "read"
  | "answered"
  | "refused"
  | "waiting-for-person"
  | "expired"
  | "stopped";

/** How a session the engine opens may act in a project: read and reply, or build on a branch. */
export type OpenMode = "read-only" | "branch";

/** Who sent a message: the project, the item it was sent from, and the agent (`session`, a task `T-n`, or a role). */
export interface MailParty {
  workspace: string;
  project: string;
  item: string | null;
  agent: string;
}
/** Where a message goes: a project, and within it an agent and an item when the sender knows them. */
export interface MailAddressee {
  workspace: string;
  project: string;
  item: string | null;
  agent: string | null;
}

/** The session the engine started for a message, and how it was bounded (SP2c §10). */
export interface OpenedSession {
  mode: OpenMode;
  cwd: string;
  branch: string | null;
  pid: number | null;
  /** The `--name` the session was given, for the doorbell. */
  name: string;
  maxTurns: number;
  maxMinutes: number;
  startedAt: string;
  /** Path of the session's output log, beside the sender's outbox. */
  log: string;
  endedAt?: string;
  outcome?: "ended" | "expired" | "stopped" | "failed";
  turns?: number;
  costUsd?: number;
}

export interface Message {
  id: string;
  at: string;
  from: MailParty;
  to: MailAddressee;
  type: MailType;
  subject: string;
  /** The body when it is under 2 KB; a preview otherwise, with the whole text at `bodyFile`. */
  body: string;
  bodyFile?: string;
  replyTo: string | null;
  hops: number;
  status: MailStatus;
  /** For `refused`, `expired` and `stopped`: why. */
  reason?: string;
  /** A message to or from a role, carried by the lead on the role's behalf (SP2c §7). */
  relayed?: boolean;
  opened: OpenedSession | null;
  readAt?: string;
  answeredAt?: string;
  /** A reply to a change request ends with the branch, the child item and its verdict. */
  branch?: string;
  item?: string;
  verdict?: "proven" | "unproven";
  /** A blocker the Stop hook has named once. */
  noticedAt?: string;
}

export interface Mailbox {
  version: 1;
  messages: Message[];
}

/** How a party is named in a line or a table: the project, then `/agent` unless the agent is the session. */
export function partyLabel(party: { project: string; agent: string | null }): string {
  const agent = party.agent ?? "session";
  return agent === "session" ? party.project : `${party.project}/${agent}`;
}

/** The `mail` block of `policy.json` (SP2c §6). A project without a workspace is alone. */
export interface MailPolicy {
  workspace: string | null;
  name: string | null;
  accept: MailType[];
  open: OpenMode;
  maxConcurrent: number;
  maxHops: number;
  maxTurns: number;
  maxMinutes: number;
  /** Where task worktrees are made: `..` (beside the root) or a path relative to the root, for sandboxes that confine writes. */
  worktrees: string;
}

/** What a turn may end waiting for: the user, the roles still answering, or a reply to a message (SP2c §9). */
export type Awaiting = "user" | "role" | "mail";

/** A task of the plan handed to an implementer: the message, the worktree, the branch, the child and the merge (SP2c §7). */
export interface TaskRecord {
  task: string;
  message: string;
  criteria: string[];
  text: string;
  branch: string;
  worktree: string;
  openedAt: string;
  child?: string;
  verdict?: "proven" | "unproven";
  repliedAt?: string;
  mergedAt?: string;
  mergeCommit?: string;
  forced?: boolean;
}

/** A role's end as the SubagentStop hook recorded it: its tokens from its transcript, and the file its answer was saved to. */
export interface RoleRecord {
  agent: string;
  agentId?: string;
  at: string;
  tokens: number;
  tokensFrom: "transcript" | "none";
  /** Relative to the work folder, or null when the answer matched no known shape. */
  file: string | null;
}

/** A project the engine has seen (`~/.wizardingcode/crew/projects.json`). */
export interface ProjectEntry {
  root: string;
  name: string;
  workspace: string | null;
  lastSeen: string;
  sessionId: string;
  /** The main checkout, when this root is a git worktree of it. */
  worktreeOf?: string;
  /** The message that opened the session running in this root. */
  mail?: string;
}
export interface Registry {
  version: 1;
  projects: ProjectEntry[];
}

export type WorkType = "fix" | "feature" | "refactor" | "chore" | "new-product" | "question";

export type Phase =
  | "receive"
  | "recognize"
  | "understand"
  | "specify"
  | "conclave"
  | "plan"
  | "build"
  | "gate"
  | "deliver";
export const PHASE_ORDER: readonly Phase[] = [
  "receive",
  "recognize",
  "understand",
  "specify",
  "conclave",
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

/** `observed`: proven by a passing run after the change plus the reason no red run can exist (SP2 §11). */
export type CriterionKind = "behavior" | "preserve" | "observed";
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
  kind?: Awaiting;
}

/**
 * The item started while other items of the checkout were open and watched files had uncommitted
 * changes: a second session on one checkout (finding 9). The proof still covers the whole tree.
 */
export interface SharedCheckout {
  with: string[];
  paths: string[];
  at: string;
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

export type DecidedBy = "user" | "agent" | "validator";

/** The rules under which the validator may take a user-only decision in an unattended session (SP2 §9). */
export type ValidatorRule = "complete-gap-round" | "stated-default";
export const VALIDATOR_RULES: readonly ValidatorRule[] = ["complete-gap-round", "stated-default"];
export function isValidatorRule(value: unknown): value is ValidatorRule {
  return VALIDATOR_RULES.includes(value as ValidatorRule);
}

/**
 * Who took a user-only decision; `mode` when no person was watching; `rule` when the validator took
 * it; `relayed` when a person's yes came through the agent from the conversation, with no prompt,
 * under the policy's `attendedDecisions: relay` (ADR 0005).
 */
export interface Decision {
  by: DecidedBy;
  mode?: PermissionMode;
  rule?: ValidatorRule;
  relayed?: boolean;
}

export interface Approval {
  what: "spec";
  at: string;
  /** Absent in records written before 0.1.2, which read as the user's. */
  by?: DecidedBy;
  mode?: PermissionMode;
  rule?: ValidatorRule;
  relayed?: boolean;
}

/** A decision only the user can make, found by the gap round; answered by a person or, under a rule, by the validator. */
export interface GapDecision {
  id: string;
  question: string;
  default?: string;
  answer?: string;
  at?: string;
  by?: DecidedBy;
  mode?: PermissionMode;
  rule?: ValidatorRule;
  relayed?: boolean;
}

export type ObjectionSeverity = "blocking" | "advisory";
export interface Waiver {
  reason: string;
  at: string;
  by: DecidedBy;
  mode?: PermissionMode;
  relayed?: boolean;
}
/** A dated statement that the work must not proceed as proposed; bound to a criterion, or waived by the user. */
export interface Objection {
  id: string;
  raisedBy: string;
  severity: ObjectionSeverity;
  text: string;
  raisedAt: string;
  criterion?: string;
  waived?: Waiver;
}
export interface ObjectionLedger {
  objections: Objection[];
}

export interface Skip {
  /** `tdd:<criterion id>`, `gate:<gate name>` or a phase name. */
  step: string;
  reason: string;
  at: string;
  by?: DecidedBy;
  mode?: PermissionMode;
  relayed?: boolean;
}

/** The debate of the conclave (SP2 §7): when it opened and why, when it closed, and what it cost. */
export interface Debate {
  openedAt: string;
  reason: string;
  closedAt?: string;
  tokens?: number;
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
  awaiting: Awaiting | null;
  /** For `awaiting: "mail"`: the message whose reply the item waits for. */
  awaitingMessage?: string;
  /** The message that started this item, when mail did (SP2c §7, §8). */
  origin?: { mail: string };
  /** The lead's item and task, when this item is an implementer's child. */
  parent?: { project: string; item: string; task: string; root: string };
  /** The tasks this item handed to implementers. Absent before 0.5.0 and when none was opened. */
  tasks?: TaskRecord[];
  criteria: Criterion[];
  /** Absent in records written before 0.1.4. */
  removedCriteria?: RemovedCriterion[];
  /** Turns that ended waiting for the user while the work was not proven. Absent before 0.1.4. */
  pauses?: Pause[];
  /** Set when the item started beside other open items with uncommitted changes. Absent before 0.1.7. */
  sharedCheckout?: SharedCheckout;
  /** The gap round's decisions only the user can make, and their answers. Absent before 0.2.0. */
  decisions?: GapDecision[];
  /** The debate, when the gap round found a decision with consequences. Absent before 0.4.0 and when none opened. */
  debate?: Debate;
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
  observed?: RunRecord;
  /** For an observed criterion: why no red run can exist. */
  reason?: string;
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
  /**
   * The dependency audit, judged against the item's base commit (ADR 0006): how many advisories the
   * run found, how many the base already had, the new ones, and whether the base could be audited.
   */
  advisories?: { current: number; known: number; fresh: string[]; baselined: boolean };
  /** A lint or typecheck run read for the files it names (ADR 0006): the ones the item changed, and how many untouched files have problems. */
  problems?: { touched: string[]; untouched: number };
  /** The watched files a build gate rewrote; the stamp of the gate run was taken after it (finding 18). */
  wrote?: string[];
}

export type JudgementVerdict = "proven" | "not-proven" | "not-run";
export type FindingSeverity = "defect" | "advisory";
/** One finding of a reviewer, tied to a file; `outside` when the file is not part of the item's change (ADR 0006: reported, never failed on). */
export interface JudgementFinding {
  file: string;
  line?: number;
  text: string;
  severity: FindingSeverity;
  outside?: boolean;
}
/** A judgement gate's ruling as recorded: the judge's verdict, the reviewer's findings, stamped with when and on which code. */
export interface JudgementRecord {
  gate: JudgementGateName;
  verdict: JudgementVerdict;
  reviewer?: string;
  judge?: string;
  findings: JudgementFinding[];
  tokens?: number;
  /** For `not-run`: why the gate could not run. */
  reason?: string;
  at: string;
  /** The fingerprint of the code the ruling vouches for; a ruling on other code counts as not run. */
  fingerprint: string;
}

export interface Evidence {
  fingerprint: string | null;
  tdd: TddRecord[];
  runs: GateRun[];
  verdict: "proven" | "unproven";
  unproven: string[];
  /** One ruling per judgement gate, the latest for each. Absent before 0.4.0. */
  judgement?: JudgementRecord[];
  /** Each role's end as SubagentStop recorded it. Absent before 0.5.0. */
  roles?: RoleRecord[];
}

export interface Policy {
  requiredGates: GateName[];
  /** Judgement gates the team requires on every item beyond the route's own (SP2 §10). */
  judgementGates: JudgementGateName[];
  riskPaths: Partial<Record<RiskArea, string[]>>;
  /**
   * Globs of changed paths that never raise a risk area, default or added (findings 1 and 14).
   * The one way a policy loosens a default: decided by a person, named in the work's record.
   */
  riskPathExclusions: string[];
  minimumRoute: Route;
  /** Steps that may be skipped: `tdd` (the default) any test-first step, `*` any step, a gate by name. Gates are mandatory unless listed. */
  allowSkips: string[];
  artifacts: "commit" | "local";
  /**
   * What a user-only decision taken with no person watching is worth: `wait` records it and the
   * guard and the verdict still wait for a person; `count` lets the agent's own word count;
   * `validator` lets a decision the validator took under a rule count, and the agent's not.
   */
  unattendedDecisions: "wait" | "count" | "validator";
  /**
   * How the user signs a decision with a person present: `prompt`, the permission prompt the
   * agent's command raises; `relay`, the agent relaying the user's yes from the conversation with no
   * prompt, recorded as "by the user, relayed by the agent" (ADR 0005). The policy's own commands
   * are always asked.
   */
  attendedDecisions: "prompt" | "relay";
  /** The mailbox: the workspace, the name, what is accepted, what may open and the limits (SP2c §6). */
  mail: MailPolicy;
}

export type Mode = "partner" | "guide" | "pilot";
export interface UserConfig {
  mode: Mode;
  decisions: { log: boolean };
}
