export type GateName = "build" | "test" | "lint" | "typecheck" | "secrets" | "deps" | "e2e";
export const GATE_NAMES: readonly GateName[] = [
  "build",
  "test",
  "lint",
  "typecheck",
  "secrets",
  "deps",
  "e2e",
];

/**
 * A gate whose verdict is a reviewer's ruling against a rubric and a judge's decision, not an exit
 * code (SP2 §10). Kept apart from `GateName`: the engine runs those, the session's roles run these.
 */
export type JudgementGateName =
  | "code-quality"
  | "test-quality"
  | "security"
  | "ui-ux"
  | "risk"
  | "architecture"
  | "data"
  | "infra"
  | "strategy";
export const JUDGEMENT_GATES: readonly JudgementGateName[] = [
  "code-quality",
  "test-quality",
  "security",
  "ui-ux",
  "risk",
  "architecture",
  "data",
  "infra",
  "strategy",
];
export function isJudgementGateName(value: unknown): value is JudgementGateName {
  return JUDGEMENT_GATES.includes(value as JudgementGateName);
}

/** The nine areas of the organization (SP7 §6). */
export type TeamName =
  | "architects"
  | "researchers"
  | "etl"
  | "security"
  | "devops"
  | "qa"
  | "backend"
  | "frontend"
  | "agentic-os";

/** One role the engine plans for an item, with the reason it runs (SP7 §3, §6.1). */
export interface Seat {
  role: string;
  team: TeamName | null;
  kind: "gate" | "debate" | "lead" | "cto";
  gate?: JudgementGateName;
  reason: string;
}

export type Personality =
  | "adventurous"
  | "creative"
  | "conservative"
  | "sceptical"
  | "professional";

/** A tech lead's verdict on the spec, the plan or the delivery (SP7 §6.4), recorded from the lead's file. */
export interface Validation {
  what: "spec" | "plan" | "delivery";
  by: string;
  verdict: "validated" | "returned";
  returns: number;
  round: number;
  /** The lead's file, relative to the work folder. */
  file: string;
  /** The content the verdict is about: the spec's or the plan's hash, the evidence fingerprint for a delivery. */
  hash: string;
  /**
   * The sha256 of the lead's file as read (finding 119): a file already recorded for this lead and
   * this `what` is an earlier round's answer and is refused as a new one. Absent on older records,
   * which tell nothing apart and are read as before.
   */
  fileHash?: string;
  at: string;
}

/** The `team` block of `policy.json` (SP7 §6.1): a template, teams added beyond the route, and caps that only tighten. */
export interface TeamPolicy {
  /** `core`, or the template of a registered pack (SP6 Task 2); an unregistered name applies nothing. */
  template: string;
  always: TeamName[];
  specialists: string[];
  maxExperts: number;
  maxValidationRounds: number;
  maxJudgementRounds: number;
  maxGateRounds: number;
  /** Whether rounds past a cap run as the user's standing grant, up to the cap plus two (SP7b decision 15), or wait for `crew continue` (`ask`, the default). */
  continuations: "ask" | "granted";
}

/** A judgement gate the item needs, and why: "standard route", "risk area auth", "interface files: a.vue", "policy". */
export interface PlannedJudgement {
  gate: JudgementGateName;
  reason: string;
}

/** The strategy's judgement gate as planned (SP8 Task 3): the CTO reviews on full, the judge rules alone on standard. */
export type StrategyReviewer = "cto" | "judge";
export interface PlannedStrategyJudgement extends PlannedJudgement {
  gate: "strategy";
  reviewer: StrategyReviewer;
}

export type CommandSource = "detected" | "proposed" | "confirmed";
export interface GateCommand {
  command: string;
  source: CommandSource;
  /** This gate's own time limit; without it the target's applies, with a twenty-minute floor for `test`. */
  timeoutMs?: number;
  /** The pack whose detector rule gave the command (SP6 Task 2): proposed until a person confirms it. */
  pack?: string;
}

/** The stacks the core detects; 'other' is a target a person configured by hand, on a stack no detector knows. */
export const CORE_STACKS = ["node", "php", "python", "other"] as const;
export type CoreStack = (typeof CORE_STACKS)[number];
/** A core stack, or the id of a pack's detector rule (SP6 Task 2). */
export type Stack = string;

export interface Target {
  /** Path relative to the repository root; '.' for the root itself. */
  path: string;
  stack: Stack;
  packageManager: string;
  gates: Partial<Record<GateName, GateCommand>>;
  timeoutMs: number;
  /** The target whose manifest lists this folder as a workspace; its gates cover the ones this target does not define. */
  workspaceOf?: string;
  /** A test command narrowed to a todo's files (SP7 §8.1): a template with `{files}`, detected or set by the user. */
  testScoped?: GateCommand;
  /** The ids of the pack rules that refined this target (SP6 Task 2): read beside `stack` for the expert's knowledge files. */
  tags?: string[];
  /** Gates the user removed with `crew profile unset` (finding 87): a `test` listed here is not planned for the target. */
  unset?: GateName[];
}

/**
 * How the project runs for a proof on localhost (SP7 §8.2): detected where the project declares it,
 * proposed otherwise, confirmed by the user key by key. `logs` is a file or a command the e2e gate
 * reads; `url` where the application answers.
 */
export interface Environment {
  start: GateCommand;
  health: GateCommand;
  stop?: GateCommand;
  logs?: string;
  url?: string;
  timeoutMs: number;
}

export interface Profile {
  version: 1;
  detectedAt: string;
  targets: Target[];
  watch: { exclude: string[] };
  environment?: Environment;
}

export type Route = "fast" | "standard" | "full";
export const ROUTE_ORDER: readonly Route[] = ["fast", "standard", "full"];

/** The four priorities of a message and of a work item (SP7 §9), in the inbox's order. */
export type MailPriority = "blocker" | "high" | "normal" | "low";
export const MAIL_PRIORITIES: readonly MailPriority[] = ["blocker", "high", "normal", "low"];
export function isMailPriority(value: unknown): value is MailPriority {
  return MAIL_PRIORITIES.includes(value as MailPriority);
}

/** The receiver's decision on the sender's proposal: confirmed at the same level, or lowered with a reason; never raised (SP7 §9, §10.2). */
export interface PriorityDecision {
  proposed: MailPriority;
  confirmed: MailPriority;
  by: string;
  reason: string | null;
  at: string;
}

/** Where a request entered from (SP7 §10.1): a task manager read through the session's tools, or a document in the repository; the CLI is the absence of a source. */
export interface Source {
  channel: "document" | "task-manager";
  connector?: "clickup" | "jira" | "notion" | "other";
  externalId?: string;
  url?: string;
  documentPath?: string;
  proposedPriority?: MailPriority;
}

/** The lead's triage of a source's proposed priority against the business priorities the user signed (SP7 §10.2): confirmed or lowered with a reason, never raised; unconfirmed without the signed file. */
export interface Triage {
  proposed: MailPriority;
  confirmed: MailPriority | null;
  by: string;
  reason: string | null;
  against: "signed" | "unsigned" | "none";
  at: string;
}

/** Where a doubt was posted (SP7 §10.3, rule 7): the conversation, the ticket, the document's questions file, the project's own mail. */
export type QuestionChannelKind = "cli" | "mail" | "ticket" | "document";

export interface QuestionChannel {
  kind: QuestionChannelKind;
  /** Posted by the engine (cli, document, mail) or marked posted by the skill (the ticket). */
  posted: boolean;
  /** The ticket's url or id, the questions file's path, the message id; null for the conversation or until the post. */
  ref: string | null;
}

/** A doubt on record (SP7 §10.3): what was asked, where it went, and the person's answer; `Question` is the typed question of classify.ts. */
export interface QuestionRecord {
  id: string;
  text: string;
  askedAt: string;
  channels: QuestionChannel[];
  answer: string | null;
  by: string | null;
  answeredAt: string | null;
}

/** What a reply to a change request may promise about an interface, checked at the branch's tip (SP7 §9). */
export type ContractKind = "openapi" | "types" | "schema" | "clause";
export const CONTRACT_KINDS: readonly ContractKind[] = ["openapi", "types", "schema", "clause"];
export interface Contract {
  kind: ContractKind;
  /** Relative to the replying project; null for a clause, which is a claim of the body. */
  path: string | null;
  /** sha256 of the file at the branch's tip when the reply was sent; null for a clause. */
  hash: string | null;
  summary: string;
}

/** What a reply carries of the child item's evidence, read from its records, never typed (SP7 §9). */
export interface ReplyEvidence {
  report: string | null;
  fingerprint: string | null;
  gatesPassed: GateName[];
}

/** The four kinds of mail (vision §10). */
export type MailType = "question" | "change-request" | "notice" | "blocker";
export const MAIL_TYPES: readonly MailType[] = ["question", "change-request", "notice", "blocker"];
export function isMailType(value: unknown): value is MailType {
  return MAIL_TYPES.includes(value as MailType);
}

/**
 * Where a request stands, as the receiving engine last recorded it (SP7 §9): the seven statuses
 * plus `expired`. Records written before 0.7.0 hold `answered`, `waiting-for-person` and
 * `stopped`; `mailStatus()` reads them as `done`, `blocked` and `refused`, and nothing rewrites them.
 */
export type MailStatus =
  | "sent"
  | "read"
  | "accepted"
  | "in-progress"
  | "blocked"
  | "done"
  | "refused"
  | "expired"
  | "answered"
  | "waiting-for-person"
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
  /**
   * The process's start time as `ps` prints it, read when it was started: with the pid, what tells
   * the session from another process that took its pid later (the real binary shows no arguments
   * in a process listing, so the name cannot).
   */
  processStart?: string;
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
  /** The sender's proposal (SP7 §9); absent on records written before 0.7.0, read as `normal` (`blocker` for a blocker). */
  priority?: MailPriority;
  /** The receiver's confirmation or lowering, on every copy. */
  priorityDecision?: PriorityDecision;
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
  /** The thread's root (SP7 §9): absent on a root and on records before 0.7.0; read through `threadOf()`. */
  thread?: string;
  /** The contracts a reply promised, each checked by the replying engine; read through `readContracts()`. */
  contracts?: Contract[];
  /** The child item's evidence as the reply carried it; read through `readEvidence()`. */
  evidence?: ReplyEvidence;
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
  /** How many parties a thread may join (SP7 §9, §18): 4, tightening to 2. */
  maxParties: number;
}

/** What a turn may end waiting for: the user, the roles still answering, or a reply to a message (SP2c §9). */
export type Awaiting = "user" | "role" | "mail";

/** A task of the plan handed to an implementer: the message, the worktree, the branch, the child and the merge (SP2c §7). */
export interface TaskRecord {
  task: string;
  message: string;
  criteria: string[];
  /** Where the todo stands (SP7 §8.1): open (no reply), handed (an implementer runs), merged, gated (its gate passed), briefed. */
  state?: "open" | "handed" | "merged" | "gated" | "briefed";
  /** The todo's own gate, run on the files its diff touched; its runs are the todo's, never the item's evidence. */
  gate?: {
    round: number;
    at: string;
    status: "pass" | "fail";
    runs: GateRun[];
    scope: string[];
    /** The judgement gates the todo's files ask for (SP7b decision 14), a union across its rounds; never shrinks. */
    planned?: PlannedJudgement[];
    /** The files the todo's review inputs were cut for: the round's scope with the todo's own. */
    cut?: string[];
    /** The rulings recorded with `--task`, each on the current code and the current cut. */
    judgement?: JudgementRecord[];
  };
  /** The brief's path, relative to the work folder. */
  brief?: string;
  /** A todo done inline by the lead: no worktree, no message; its scope names its files. */
  inline?: true;
  scope?: string[];
  text: string;
  branch: string;
  worktree: string;
  openedAt: string;
  child?: string;
  verdict?: "proven" | "unproven";
  repliedAt?: string;
  mergedAt?: string;
  mergeCommit?: string;
  /** Who forced the merge of an unproven child, as the command recorded the decision; absent for a merge of a proven child. */
  forcedBy?: Decision;
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
  /** The lens the role was given (SP7 §6.3), read from its answer's `personality:` line; `unknown` for a name the registry does not have. */
  personality?: Personality | "unknown";
  /** The team the role sits in, from the registry; absent for the judge and the debate's critics. */
  team?: TeamName;
  /** Who filed the answer (SP6 Task 4): the SubagentStop hook (absent, the default) or the session with `crew answer file`. */
  filedBy?: "hook" | "session";
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
  /** When a session's hook last ran here; liveness reads this, never a command's registration (SP2c 8a). */
  lastHook?: string;
}
export interface Registry {
  version: 1;
  projects: ProjectEntry[];
}

export type WorkType =
  | "fix"
  | "feature"
  | "refactor"
  | "chore"
  | "new-product"
  | "question"
  | "audit";

/** The kind of work (SP7 §7.1): it picks the phases with the route. The answers' choice lists the six; `audit` is derived from its type alone (SP8). */
export type WorkKind =
  | "client-request"
  | "cross-project"
  | "new-project"
  | "feature"
  | "issue"
  | "audit";

/** The phases, in the order of the method: `analyse` (an issue's, SP7 §7.4) and `audit` (an audit's own, §7.5) after recognize; `strategy` (a new project's, §7.3) before specify. */
export type Phase =
  | "receive"
  | "recognize"
  | "analyse"
  | "audit"
  | "understand"
  | "strategy"
  | "specify"
  | "conclave"
  | "plan"
  | "build"
  | "gate"
  | "deliver"
  | "learn";
export const PHASE_ORDER: readonly Phase[] = [
  "receive",
  "recognize",
  "analyse",
  "audit",
  "understand",
  "strategy",
  "specify",
  "conclave",
  "plan",
  "build",
  "gate",
  "deliver",
  "learn",
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
  /** A contract of a reply in the item's mail the criterion is bound to (SP7 §9): the message and the contract's 1-based index. */
  contract?: { message: string; index: number };
  /**
   * The criterion whose text replaced this one's (finding 118's list): the report shows both, the
   * verdict reads the replacement's proof, and this one's records stay. Never removed once set.
   */
  supersededBy?: { id: string; at: string };
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
  /** `spec`: the user's approval of a spec; `audit`: a person's signature of an audit's report (SP8), never unattended. */
  what: "spec" | "audit";
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
  /** The kind of work (SP7 §7.1): answered or derived at classification. Absent before 0.8.0: read as feature. */
  kind?: WorkKind;
  /** Where the kind came from: `answer`, `origin`, `source: <channel>`, `work_type <type>`. */
  kindFrom?: string;
  /** What the base listed for this item at its classification (SP4 Task 3); absent before 0.10.0. */
  knowledge?: KnowledgeRecord;
  /** The packs the item used (SP6 Task 2), as `<name> <version>`: the knowledge files served to the expert, the template that seated a team. */
  packs?: string[];
  /** The expert's knowledge files the packs served for the item's paths and specialists (SP6 Task 6), recorded at crew team and at the gate run. */
  knowledgeFiles?: string[];
  /** The same files as `<pack>:<path inside the pack>` (finding 118): what the report prints, never a machine's path. */
  knowledgeLabels?: string[];
  /** The runtimes whose hooks observed this item (SP6 Task 4: `crew hook --runtime <name>`, `claude` for Claude Code's own), each once, in the order seen; absent on an item no hook ran under. */
  runtimes?: string[];
  /** What `crew learn` wrote and confirmed (SP4 Task 4); absent until the item learned. */
  learned?: { at: string; entries: string[]; confirmed: string[] };
  route: Route;
  routeReasons: string[];
  riskAreas: RiskArea[];
  /** The item's priority (SP7 §7.1): given at start, else its origin message's confirmed one, else normal. Absent before 0.7.0. */
  priority?: MailPriority;
  /** Where the request entered from (SP7 §10.1); absent for a request from the CLI and before 0.8.0. */
  source?: Source;
  /** The triage of the source's proposed priority (SP7 §10.2); absent without a proposal. */
  triage?: Triage;
  /** The doubts raised on the item (SP7 §10.3); absent before 0.8.0 and until the first. */
  questions?: QuestionRecord[];
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
  /**
   * The item closed on the user's word (finding 124): no longer active, open or changed by any
   * command; every file and record stays readable.
   */
  abandoned?: { at: string; reason: string; by: Decision };
  /** Set when the item started beside other open items with uncommitted changes. Absent before 0.1.7. */
  sharedCheckout?: SharedCheckout;
  /** The gap round's decisions only the user can make, and their answers. Absent before 0.2.0. */
  decisions?: GapDecision[];
  /** The debate, when the gap round found a decision with consequences. Absent before 0.4.0 and when none opened. */
  debate?: Debate;
  approvals: Approval[];
  /** Jev's dispute of the validator's rule (finding 94): held until a person clears it with crew resume or approves the spec. */
  validatorDispute?: { at: string; condition: string; confidence: number | null };
  skips: Skip[];
  /** HEAD when the item started; the change is everything since. Null outside git or with no commits. */
  baseCommit: string | null;
  /**
   * Content hashes of the watched paths that already differed from baseCommit when the item
   * started: the proven work of an earlier item, left uncommitted. A path whose content still
   * matches is not this item's change.
   */
  baseFiles?: Record<string, string>;
  /** The seats planned for the item, with their reasons; written by `crew team` and the gate run (SP7 §6.6). */
  seats?: Seat[];
  /** The team whose lead the session is: frontend when the change touches interface files, backend otherwise. */
  primaryTeam?: "backend" | "frontend";
  /**
   * Rounds recorded so far; the policy's caps are checked against them (SP7 §6.1). A judgement
   * round is the records against one state of the code: `judgementCode` is the fingerprint the
   * last counted round vouched for, so a ruling recorded again on the same code, or a not-run
   * beside it, is the same round, and a record against new code opens the next.
   */
  rounds?: {
    judgement: number;
    validation: number;
    judgementCode?: string | null;
    /** The strategy's own rounds (SP8 Task 3): a record on a new strategy hash opens one. */
    strategy?: number;
    strategyHash?: string | null;
  };
  /** The leads' verdicts on the spec, the plan and the delivery (SP7 §6.4), recorded by `crew validation`. */
  validations?: Validation[];
  /** When each phase was entered; the minutes per phase of `crew metrics` come from it. */
  phaseAt?: Partial<Record<Phase, string>>;
  /** One more round the user granted past a cap (`crew continue`), recorded as theirs. */
  continued?: {
    what: "judgement" | "validation" | "gate";
    task?: string;
    by: Decision;
    at: string;
    /** Recorded by the engine under `team.continuations: granted`, as the user's standing grant. */
    standing?: true;
  }[];
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
  /** The proof is a merged task's child item: its red and green stand in the child's record (SP2c 8a). */
  merged?: { task: string; child: string; commit: string; at: string };
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
  /** What an e2e run left under the work folder (SP7 §8.3): its folder, the console file it read and the logs it graded, or null for each it had not. */
  artifacts?: { dir: string; console: string | null; logs: string | null };
}

export type JudgementVerdict = "proven" | "not-proven" | "not-run";
export type FindingSeverity = "defect" | "advisory";
/** What Jev made of an upheld defect (SP7 §11, SP3 decision 11): verified, disputed (the defect stays), or unverified with the reason. */
export interface FindingVerification {
  status: "verified" | "disputed" | "unverified";
  reason?: string;
  confidence?: number;
}

/** One finding of a reviewer, tied to a file; `outside` when the file is not part of the item's change (ADR 0006: reported, never failed on). */
export interface JudgementFinding {
  file: string;
  line?: number;
  text: string;
  severity: FindingSeverity;
  outside?: boolean;
  verification?: FindingVerification;
}

/** One answer of Jev on the record (SP3 decision 11): what was asked, of what, the answer as returned, its confidence, the model, when. */
export interface Verification {
  what: "defect" | "validator" | "fact" | "triage" | "knowledge";
  ref: string;
  question: string;
  answer: unknown;
  confidence: number | null;
  model: string;
  at: string;
}

/** The asks the engine may make of Jev (security review of SP3 Task 6): the key alone is not consent to every one. */
export type VerifyAsk = "defect" | "validator" | "fact" | "triage" | "knowledge";
export const VERIFY_ASKS: readonly VerifyAsk[] = [
  "defect",
  "validator",
  "fact",
  "triage",
  "knowledge",
];

/** What leaves the machine and what an answer is worth (SP3 decision 9). */
export interface VerifyPolicy {
  send: "claims" | "claims-and-snippets";
  maxClaimsPerItem: number;
  threshold: number;
  asks: VerifyAsk[];
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
  /** A todo's ruling: the hash of the scope its inputs were cut for; a re-gate on other files drops it. */
  scope?: string;
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
  /** Jev's answers on this item (SP3 Task 6); absent before 0.8.0 and until the first ask. */
  verifications?: Verification[];
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
  /** The verification backend's policy (SP3 decision 9). */
  verify: VerifyPolicy;
  /** The team: a template, teams added beyond the route, and the caps on experts and rounds (SP7 §6.1). */
  team: TeamPolicy;
}

export type Mode = "partner" | "guide" | "pilot";
export interface UserConfig {
  mode: Mode;
  decisions: { log: boolean };
  /** Where Jev is reached when the environment does not say (SP3 decision 8); the key is never here. */
  jev?: { endpoint?: string; model?: string };
}

/** The kinds of a knowledge entry (SP7 §12): three the engine writes at Learn, two a person adds. */
export type KnowledgeKind =
  | "stack-preference"
  | "validated-solution"
  | "documentation"
  | "root-cause"
  | "general";

/** An item that confirmed or contradicted an entry: where, when, and why for a contradiction; `item` null for a contradiction recorded outside an item (SP6 Task 1 AC-3). */
export interface KnowledgeRef {
  item: string | null;
  project: string;
  at: string;
  reason?: string;
}

/** One entry of the knowledge base (ADR 0009): what was learned, where it came from, whether it may leave. */
export interface KnowledgeEntry {
  id: string;
  kind: KnowledgeKind;
  title: string;
  /** The origin workspace (`mail.workspace`), null for a project with none. */
  workspace: string | null;
  /** The origin project's name as the mail says it. */
  project: string;
  /** The origin project's main checkout, by its real path: what tells two alone projects apart. */
  projectRoot: string;
  /** Marked: read inside its workspace alone (rule 13); unmarked by a person's `crew knowledge unmark`. */
  confidential: boolean;
  item: string | null;
  commit: string | null;
  stacks: Stack[];
  paths: string[];
  words: string[];
  text: string;
  source: string | null;
  createdAt: string;
  confirmedBy: KnowledgeRef[];
  contradictedBy: KnowledgeRef[];
}

export interface KnowledgeBase {
  version: 1;
  next: number;
  entries: KnowledgeEntry[];
}

/** What `addEntry` takes: an entry without what the base gives it. */
export type KnowledgeDraft = Omit<
  KnowledgeEntry,
  "id" | "createdAt" | "confirmedBy" | "contradictedBy"
>;

/** A root cause the base holds on one of an issue's origin paths (SP4 Task 5, rule 17), as `analysis/origin.json` records it. */
export interface KnownRootCause {
  id: string;
  title: string;
  item: string | null;
  commit: string | null;
  /** The entry's paths the origin shares. */
  paths: string[];
}

/** What the base listed for an item at its classification (SP4 Task 3): read by the skill, cited by the strategy. */
export interface KnowledgeRecord {
  readAt: string;
  listed: string[];
  /** Why the base could not be read, when it could not: the item went on without it. */
  unreadable?: string;
}
