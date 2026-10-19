import { existsSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { type Parsed, parse } from "./argv.ts";
import {
  AnswerError,
  type Answers,
  computeRoute,
  type KindContext,
  kindOf,
  PRIORITY_LEVELS,
  validateAnswers,
} from "./classify.ts";
import { loadConfig, saveConfig, setConfigValue } from "./config.ts";
import {
  appendDecision,
  decisionLine,
  decisionsCount,
  listDecisions,
  registerTampered,
} from "./decisions.ts";
import { ENVIRONMENT_TIMEOUT_MS } from "./detect/environment.ts";
import { detectProfile, missingTestCommands } from "./detect/index.ts";
import {
  checkHealth,
  type EnvStatus,
  envStatus,
  startEnvironment,
  stopEnvironment,
} from "./environment.ts";
import {
  countedNote,
  decidedBy,
  loadEvidence,
  renderReport,
  tddSummary,
  updateEvidence,
} from "./evidence.ts";
import { changedWatchedPaths, hashPaths, isGitRepo } from "./fingerprint.ts";
import { ensureDir, nowIso, readText, sha256, writeText } from "./fs.ts";
import { assess, reassess, runGates, runTaskGate } from "./gates.ts";
import { handleHook } from "./hooks/index.ts";
import type { HookPayload } from "./hooks/types.ts";
import {
  contradiction,
  fillTokens,
  findingsText,
  judgementRows,
  keepRound,
  notRunRecord,
  parseRulings,
  plannedNote,
  plannedTaskJudgement,
  readReviewInputs,
  recordJudgement,
  scopeHash,
  stampRuling,
  verdictWord,
  writeReviewInputs,
} from "./judgement.ts";
import {
  acceptMail,
  badPriority,
  decidedPriority,
  emptyInboxSummary,
  inboxSummary,
  loadItemMail,
  loadRegistry,
  type MailContext,
  MESSAGE_ID,
  mailContext,
  mailStatus,
  markRead,
  moveMail,
  ownInbox,
  priorityOf,
  pruneRegistry,
  readContracts,
  readEvidence,
  readOpenSessions,
  recordInItem,
  refuseMail,
  registerProject,
  reply as replyMail,
  send,
  syncMail,
  TASK_AGENT,
  tamperedBox,
  threadMessages,
  worktreeMainRoot,
} from "./mail.ts";
import { computeMetrics, metricsText } from "./metrics.ts";
import {
  addObjection,
  bindObjection,
  loadLedger,
  objectionStatus,
  saveLedger,
  waiveObjection,
} from "./objections.ts";
import {
  minutesRun,
  minutesText,
  openForMail,
  pidState,
  type SweepResult,
  stopSession,
  sweepSafely,
} from "./open.ts";
import {
  type CrewPaths,
  PROTECTED_WORK_FILES,
  pathsFor,
  resolvePaths,
  userDirOf,
  workDir,
} from "./paths.ts";
import {
  decisionCounts,
  loadPolicy,
  MAIL_NAME,
  SETTABLE_POLICY_KEYS,
  setPolicyValue,
  skipAllowed,
} from "./policy.ts";
import { acceptPriorities, prioritiesState, triagePriority } from "./priorities.ts";
import { ensureProfile, loadProfile, refreshProfile, saveProfile } from "./profile.ts";
import { parseSource, sourceLine } from "./source.ts";
import { ensureCrewDir, oneLine, workingRoles } from "./state.ts";
import { integrityOf, recordIntegrity, writeProtectedText } from "./store.ts";
import {
  listTasks,
  mergeTask,
  noteTask,
  openTask,
  takeReplies,
  taskScope,
  taskText,
  writeBrief,
} from "./tasks.ts";
import { recordTdd, type TddStep } from "./tdd.ts";
import { plannedSeats, primaryTeam } from "./team.ts";
import type {
  Criterion,
  Decision,
  Environment,
  Evidence,
  GateName,
  JudgementGateName,
  JudgementRecord,
  MailPriority,
  Message,
  OpenedSession,
  Phase,
  PlannedJudgement,
  Policy,
  Profile,
  ProjectEntry,
  Stack,
  TaskRecord,
  Triage,
  UserConfig,
  WorkItem,
} from "./types.ts";
import {
  GATE_NAMES,
  isJudgementGateName,
  isMailPriority,
  isMailType,
  isPermissionMode,
  isValidatorRule,
  JUDGEMENT_GATES,
  PERMISSION_MODES,
  PHASE_ORDER,
  partyLabel,
  VALIDATOR_RULES,
} from "./types.ts";
import { parseValidation, validationHash } from "./validation.ts";
import { VERSION } from "./version.ts";
import {
  activeWork,
  addCriterion,
  addDecision,
  addSkip,
  advancePhase,
  answerDecision,
  applyClassification,
  approve,
  closeDebate,
  createWork,
  debateState,
  type GuardContext,
  isSkipped,
  kindLabel,
  kindOfItem,
  loadWork,
  nextPhaseOf,
  openDebate,
  openItems,
  phasesFor,
  removeCriterion,
  saveWork,
  validatorPreconditions,
  waitingText,
} from "./work.ts";
import { environmentState, projectThreads, workspaceStatus } from "./workspace.ts";
import { gitRun } from "./worktree.ts";

export interface CliIo {
  stdout(text: string): void;
  stderr(text: string): void;
  stdin(): Promise<string>;
  env: NodeJS.ProcessEnv;
  cwd: string;
}

// The flags each command knows, besides the global --json. A flag outside the list is refused, so
// a misspelt or misplaced one never passes in silence (finding 7: `start --kind` created
// behaviour criteria). `hook` is not here: Claude Code calls it, and its payload is on stdin.
const KNOWN_FLAGS: Record<string, readonly string[]> = {
  detect: ["refresh"],
  profile: ["target", "stack", "force", "timeout"],
  policy: [],
  accept: [],
  start: ["answers", "criterion", "preserve", "origin", "priority", "source", "reason"],
  classify: ["answers"],
  criteria: ["kind", "contract"],
  decision: ["default"],
  debate: ["reason", "tokens"],
  decide: ["mode", "validator"],
  objection: ["by", "severity", "criterion", "reason", "mode"],
  approve: ["mode", "validator"],
  phase: [],
  await: [],
  resume: [],
  tdd: ["reason"],
  gate: ["only"],
  judgement: ["ruling", "not-run", "reason", "task"],
  skip: ["reason", "mode"],
  evidence: [],
  status: [],
  env: [],
  task: ["criteria", "text", "scope", "force", "mode", "print"],
  workspace: ["file"],
  mail: [
    "to",
    "type",
    "agent",
    "item",
    "reply-to",
    "subject",
    "file",
    "reason",
    "branch",
    "as",
    "all",
    "priority",
    "thread",
    "contract",
  ],
  mode: [],
  config: [],
  version: [],
  help: [],
};

/** The first flag the command does not know, as a refusal, or null when every flag is known. */
function unknownFlag(command: string, parsed: Parsed): Outcome | null {
  const known = KNOWN_FLAGS[command];
  if (!known) return null;
  const unknown = Object.keys(parsed.flags).find((k) => k !== "json" && !known.includes(k));
  if (unknown === undefined) return null;
  const takes = [...known, "json"].map((k) => `--${k}`).join(", ");
  const hint =
    command === "start" && unknown === "kind"
      ? '; for a criterion that existing tests keep green use --preserve "<text>"'
      : "";
  return refuse(`unknown flag --${unknown} for ${command} (it takes ${takes})${hint}`);
}

/** `stdout` prints the text on stdout even when the code is not 0: the text is a result, not an error. */
type Outcome = { code: number; text: string; data?: Record<string, unknown>; stdout?: boolean };
const ok = (text: string, data: Record<string, unknown> = {}): Outcome => ({ code: 0, text, data });
const refuse = (text: string, data: Record<string, unknown> = {}): Outcome => ({
  code: 1,
  text,
  data,
});
/** A step a command goes on without (the mail synced, the replies taken into the record): its failure as one line under `label`, or an empty string. */
function guarded(label: string, step: () => void): string {
  try {
    step();
    return "";
  } catch (error) {
    return `${label}: ${(error as Error).message.split("\n")[0]}`;
  }
}
/** What a sweep did, for a command's output: the count of what ended and expired with each line, or the sweep's own lines (a failure among them), or nothing. */
function sweptText(swept: SweepResult): string {
  if (swept.ended.length || swept.expired.length)
    return `swept: ${swept.ended.length} ended, ${swept.expired.length} expired (${swept.lines.join("; ")})`;
  return swept.lines.join("\n");
}

interface Env {
  paths: CrewPaths;
  profile: Profile;
  policy: Policy;
  config: UserConfig;
  tampered: boolean;
  /** Protected files changed outside the engine, each with the `crew accept` target that trusts it again. */
  tamperedFiles: TamperedFile[];
  /** Who this project is in the mail (SP2c §6), for every command that reads or writes the mailbox. */
  mail: MailContext;
  /** This project's registry entry, refreshed by this command (plan decision 3). */
  registered: ProjectEntry;
}

interface TamperedFile {
  file: string;
  accept: string;
}

interface Opened {
  work: WorkItem;
  tampered: boolean;
}

const INACTIVE =
  "crew is inactive here: not a git repository and no .crew/ folder; run crew detect in the project root to activate it";

function tamperMessage({ file, accept }: TamperedFile): string {
  return `state changed outside the engine: ${file}; the user can accept it with crew accept ${accept}`;
}

function load(paths: CrewPaths, processEnv: NodeJS.ProcessEnv): Env {
  const profile = ensureProfile(paths);
  const policy = loadPolicy(paths);
  ensureCrewDir(paths, policy.policy);
  const tamperedFiles: TamperedFile[] = [];
  if (profile.tampered) tamperedFiles.push({ file: ".crew/profile.json", accept: "profile" });
  if (policy.tampered) tamperedFiles.push({ file: ".crew/policy.json", accept: "policy" });
  // Every command refreshes the project's registry entry, at most once in two minutes (plan decision 3).
  const mail = mailContext(paths, policy.policy, processEnv);
  const registered = registerProject(mail, processEnv.CLAUDE_CODE_SESSION_ID ?? "cli", {
    minIntervalMs: 2 * 60 * 1000,
  });
  return {
    paths,
    profile: profile.profile,
    policy: policy.policy,
    config: loadConfig(paths),
    tampered: tamperedFiles.length > 0,
    tamperedFiles,
    mail,
    registered,
  };
}

function openWork(env: Env, id: string | undefined): Opened | Outcome {
  if (!id) return refuse("a work item id is required");
  const read = loadWork(env.paths, id);
  if (!read.work) {
    return read.tampered
      ? refuse(tamperMessage({ file: `.crew/work/${id}/work.json`, accept: id }))
      : refuse(`unknown work item: ${id}`);
  }
  return { work: read.work, tampered: read.tampered };
}

/**
 * Every command that saves state refuses while any state it would build on was changed outside
 * the engine: saving would record new hashes and pass the change off as the engine's own work.
 */
function tamperRefusal(env: Env, opened?: Opened): Outcome | null {
  const found = [...env.tamperedFiles];
  // The project's decision register is the engine's too (SP7 §6.6).
  if (registerTampered(env.paths))
    found.push({ file: ".crew/decisions.json", accept: "decisions" });
  if (opened) {
    const base = `.crew/work/${opened.work.id}`;
    if (opened.tampered) found.push({ file: `${base}/work.json`, accept: opened.work.id });
    if (loadEvidence(env.paths, opened.work.id).tampered)
      found.push({ file: `${base}/evidence.json`, accept: opened.work.id });
    if (loadLedger(env.paths, opened.work.id).tampered)
      found.push({ file: `${base}/objections.json`, accept: opened.work.id });
  }
  const first = found[0];
  return first ? refuse(tamperMessage(first)) : null;
}

/**
 * The step names a skip can carry, so the report and the verdict agree on what was skipped:
 * `lint` is `gate:lint`, `AC-1` is `tdd:AC-1`, and a phase is its own name. A bare `build` is the
 * build gate, since skipping the build phase itself is not a thing.
 */
function skipStep(work: WorkItem, raw: string): string | null {
  const isGate = (name: string) =>
    GATE_NAMES.includes(name as GateName) || isJudgementGateName(name);
  const isCriterion = (id: string) => work.criteria.some((c) => c.id === id);
  if (isGate(raw)) return `gate:${raw}`;
  if (isCriterion(raw)) return `tdd:${raw}`;
  if (raw.startsWith("gate:") && isGate(raw.slice(5))) return raw;
  if (raw.startsWith("tdd:") && isCriterion(raw.slice(4))) return raw;
  if (PHASE_ORDER.includes(raw as Phase)) return raw;
  return null;
}

/** The user trusts the current content of a target's protected files again. Asks the user (PreToolUse). */
function accept(env: Env, target: string): Outcome {
  if (target === "profile" || target === "policy" || target === "decisions") {
    if (!recordIntegrity(env.paths, join(env.paths.crewDir, `${target}.json`)))
      return refuse(`no .crew/${target}.json to accept`);
    return ok(`${target} accepted: its current content is now the trusted version`, {
      accepted: target,
    });
  }
  const dir = workDir(env.paths, target);
  if (!/^[\w.-]+$/.test(target) || target.includes("..") || !existsSync(join(dir, "work.json")))
    return refuse(`unknown work item: ${target}`);
  const files = PROTECTED_WORK_FILES.filter((name) => recordIntegrity(env.paths, join(dir, name)));
  return ok(`${target} accepted: ${files.join(", ")} now trusted as they are`, {
    accepted: target,
    files,
  });
}

/** Opens a work item for a command that saves it; refuses when its state cannot be trusted. */
function openForChange(env: Env, id: string | undefined): Opened | Outcome {
  const opened = openWork(env, id);
  if (isOutcome(opened)) return opened;
  return tamperRefusal(env, opened) ?? opened;
}

function isOutcome(value: unknown): value is Outcome {
  return typeof value === "object" && value !== null && "code" in value && "text" in value;
}

/**
 * Who takes a user-only decision. Without `--mode` a person decided: through the prompt, or, under
 * the policy's `attendedDecisions: relay`, in the conversation with the agent relaying it (the hook
 * let the command through with no prompt, reading the same policy). With `--mode`, the hook found no
 * person watching (a headless session, or a mode that shows no prompt) and the agent decided in
 * that mode.
 */
function decisionFlag(parsed: Parsed, policy: Policy): Decision | Outcome {
  const mode = parsed.flags.mode;
  if (mode === undefined)
    return policy.attendedDecisions === "relay" ? { by: "user", relayed: true } : { by: "user" };
  if (!isPermissionMode(mode)) {
    return refuse(
      `--mode names the permission mode of a session with no person watching: ${PERMISSION_MODES.slice(0, -1).join(", ")} or ${PERMISSION_MODES.at(-1)}`,
    );
  }
  return { by: "agent", mode };
}

/**
 * A decision the validator takes: only with `--mode` (no person watching) and a known rule. Without
 * `--validator` the flag logic of `decisionFlag` applies unchanged.
 */
function validatorFlag(parsed: Parsed, policy: Policy): Decision | Outcome {
  const rule = parsed.flags.validator;
  if (rule === undefined) return decisionFlag(parsed, policy);
  if (!isValidatorRule(rule))
    return refuse(`unknown validator rule: ${String(rule)} (${VALIDATOR_RULES.join(", ")})`);
  if (parsed.flags.mode === undefined) {
    // With a person present only the mechanical rule applies, and the engine checks it: when the gap
    // round is complete there is no question to ask (0.3.0). Everything else, the person answers.
    if (rule !== "complete-gap-round") {
      return refuse(
        "with a person present, a person answers: the validator takes a stated default only where no person is watching (add --mode <mode>)",
      );
    }
    return { by: "validator", rule };
  }
  const base = decisionFlag(parsed, policy);
  if (isOutcome(base)) return base;
  return { by: "validator", mode: base.mode, rule };
}

/** The decision as the report will show it: who, and whether the policy counts it. */
function decisionText(policy: Policy, decision: Decision): string {
  const note = countedNote(policy, decision);
  return `${decidedBy(decision)}${note ? ` (${note.slice(2)})` : ""}`;
}

/** Who took a decision, as the register names them: `decidedBy` without its leading "by ". */
function whoDecided(decision: Parameters<typeof decidedBy>[0]): string {
  return decidedBy(decision).replace(/^by /, "");
}

/**
 * A round past a cap (SP7 §6.1): allowed within the cap plus the rounds the user continued; under
 * `team.continuations: granted` the engine records the user's standing grant for up to two more
 * rounds, saved before the round runs (SP7b decision 15); past that, refused with the text given,
 * which names `crew continue`. `round` is the rounds already spent.
 */
function continueOrRefuse(
  env: Env,
  work: WorkItem,
  what: "judgement" | "validation" | "gate",
  task: string | undefined,
  cap: number,
  round: number,
  refusal: string,
): Outcome | null {
  const mine = (work.continued ?? []).filter((c) => c.what === what && c.task === task);
  const grants = mine.filter((c) => decisionCounts(env.policy, c.by)).length;
  if (round < cap + grants) return null;
  if (env.policy.team.continuations !== "granted" || mine.filter((c) => c.standing).length >= 2)
    return refuse(refusal);
  work.continued = [
    ...(work.continued ?? []),
    { what, ...(task ? { task } : {}), by: { by: "user" }, at: nowIso(), standing: true },
  ];
  saveWork(env.paths, work);
  appendDecision(env.paths, {
    at: nowIso(),
    item: work.id,
    kind: "continue",
    text: `${what}${task ? ` of ${task}` : ""} continued under the standing grant (team.continuations: granted)`,
    by: "the user",
  });
  return null;
}

/**
 * The todo's gate record after a run (SP7b decision 14): the judgement its files ask for is the
 * run's own plan (the round's scope) with the plan of the todo's other files, a union across rounds
 * that never shrinks; the inputs are cut for the round's scope with the todo's own, and a ruling is
 * kept across the re-gate only on the current code and the current cut. Returns the planned list.
 */
function planTaskJudgement(
  env: Env,
  options: {
    work: WorkItem;
    tampered: boolean;
    record: TaskRecord;
    task: string;
    round: number;
    scope: string[];
    /** The todo's own files beyond the round's scope; empty when they could not be read. */
    ownScope: string[];
    result: Awaited<ReturnType<typeof runTaskGate>>;
  },
): PlannedJudgement[] {
  const { work, tampered, record, task, round, scope, ownScope, result } = options;
  const others = ownScope.filter((p) => !scope.includes(p));
  const cut = [...scope, ...others];
  const planned = [...(record.gate?.planned ?? [])];
  for (const p of [...result.judgement, ...plannedTaskJudgement(others, env.policy)])
    if (!planned.some((q) => q.gate === p.gate)) planned.push(p);
  const current = assess(env.paths, work, env.profile, env.policy, tampered).currentFingerprint;
  const hash = scopeHash(cut);
  record.gate = {
    round,
    at: nowIso(),
    status: result.status,
    runs: result.runs,
    scope,
    planned,
    cut,
    judgement: (record.gate?.judgement ?? []).filter(
      (j) => j.fingerprint === current && j.scope === hash,
    ),
  };
  if (result.status === "pass" && planned.length)
    writeReviewInputs(env.paths, work, cut, current, task);
  return planned;
}

/** The judgement gates a todo still owes (SP7b decision 14): planned, not skipped on the item, with no `proven` record. */
function taskPending(work: WorkItem, record: TaskRecord, policy: Policy): JudgementGateName[] {
  const gate = record.gate;
  return (gate?.planned ?? [])
    .map((p) => p.gate)
    .filter(
      (g) =>
        !isSkipped(work, `gate:${g}`, policy) &&
        !(gate?.judgement ?? []).some((r) => r.gate === g && r.verdict === "proven"),
    );
}

/** The todo's state after its gate or a ruling: gated only with the deterministic pass and nothing pending; briefed is never lowered. */
function settleTaskState(work: WorkItem, record: TaskRecord, policy: Policy): void {
  if (record.state === "briefed") return;
  const gated = record.gate?.status === "pass" && taskPending(work, record, policy).length === 0;
  if (gated) record.state = "gated";
  else if (record.state === "gated") record.state = "merged";
}

/** A todo's pending gates as the gate's text and a refusal name them: `ui-ux not proven (2 findings)`, `ui-ux not run`. */
function pendingText(record: TaskRecord, pending: readonly JudgementGateName[]): string {
  return pending
    .map((g) => {
      const r = (record.gate?.judgement ?? []).find((j) => j.gate === g);
      return r && r.verdict === "not-proven"
        ? `${g} not proven (${findingsText(r.findings.length)})`
        : `${g} not run`;
    })
    .join("; ");
}

/** What a `crew judgement record` names: the ruling file it read, or the gate it marks not run. */
interface RulingInput {
  records: JudgementRecord[];
  rulingPath: string | null;
}

/**
 * The records a `crew judgement record` makes, for the item or for a todo (SP7b decision 14): one
 * not-run record for the gate named, or every ruling of the file given, parsed against the gates
 * planned for `subject`, stamped with the fingerprint and the files the inputs were cut for, and
 * refused as a whole on one contradiction (review of item 2026-10-15-001, advisory). A gate that
 * could not run has no ruling file to record, so the two flags do not go together (review of SP2b,
 * finding 11); a relative path is from the repository root (D-1 of the SP2b minors).
 */
function rulingRecords(
  env: Env,
  parsed: Parsed,
  gateWord: string | undefined,
  planned: readonly JudgementGateName[],
  fingerprint: string,
  changed: readonly string[],
  workId: string,
  subject: string,
  usage: string,
): RulingInput | Outcome {
  const records: JudgementRecord[] = [];
  if (parsed.flags["not-run"] && typeof parsed.flags.ruling === "string")
    return refuse(
      "--not-run and --ruling do not go together: a gate that could not run has no ruling; give one or the other",
    );
  if (parsed.flags["not-run"]) {
    const reason = typeof parsed.flags.reason === "string" ? parsed.flags.reason.trim() : "";
    if (!gateWord || !reason) return refuse(usage);
    if (!isJudgementGateName(gateWord))
      return refuse(`unknown judgement gate: ${gateWord} (${JUDGEMENT_GATES.join(", ")})`);
    if (!planned.includes(gateWord))
      return refuse(`${gateWord} is not planned for ${subject}${plannedNote(planned)}`);
    records.push(notRunRecord(gateWord, reason, fingerprint));
    return { records, rulingPath: null };
  }
  if (typeof parsed.flags.ruling !== "string") return refuse(usage);
  const rulingPath = resolve(env.paths.root, parsed.flags.ruling);
  const text = readText(rulingPath);
  if (text === null) return refuse(`no ruling file at ${rulingPath}`);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return refuse(`the ruling file is not valid JSON: ${rulingPath}`);
  }
  const parsedRulings = parseRulings(raw, planned, subject);
  if ("refused" in parsedRulings) return refuse(parsedRulings.refused);
  for (const ruling of parsedRulings.rulings)
    records.push(stampRuling(ruling, fingerprint, changed, workId));
  for (const record of records) {
    const why = contradiction(record);
    if (why) return refuse(why);
  }
  return { records, rulingPath };
}

/**
 * A todo's ruling (SP7b decision 14): parsed against the gates the todo's gate planned, bound to the
 * current code and to the files its inputs were cut for, recorded into the todo's gate and never
 * into the item's evidence or its rounds; the todo is gated once nothing is pending.
 */
function recordTaskJudgement(
  env: Env,
  work: WorkItem,
  tampered: boolean,
  parsed: Parsed,
  task: string,
): Outcome {
  const usage =
    'usage: crew judgement <id> record --task T-n --ruling <file> | crew judgement <id> record <gate> --not-run --reason "<why>" --task T-n';
  const record = (work.tasks ?? []).find((t) => t.task === task);
  if (!record) return refuse(`${task} is not a task of ${work.id}`);
  const planned = (record.gate?.planned ?? []).map((p) => p.gate);
  if (!planned.length)
    return refuse(`${task} plans no judgement gate (crew task <id> gate ${task})`);
  const before = assess(env.paths, work, env.profile, env.policy, tampered);
  const inputs = readReviewInputs(env.paths, work.id, task);
  if (!inputs)
    return refuse(
      `no review inputs for ${task}: run crew task <id> gate ${task} first, then the reviewers and the judge`,
    );
  if (inputs.fingerprint !== before.currentFingerprint)
    return refuse(
      `the review inputs of ${task} describe other code than the current one: run crew task <id> gate ${task}, then the reviewers and the judge again`,
    );
  const cut = record.gate?.cut ?? record.gate?.scope ?? [];
  const input = rulingRecords(
    env,
    parsed,
    parsed.positional[3],
    planned,
    before.currentFingerprint,
    cut,
    work.id,
    task,
    usage,
  );
  if (isOutcome(input)) return input;
  const { records, rulingPath } = input;
  fillTokens(records, before.evidence.roles ?? [], inputs.at);
  const hash = scopeHash(cut);
  const gate = record.gate as NonNullable<TaskRecord["gate"]>;
  for (const r of records)
    gate.judgement = [
      ...(gate.judgement ?? []).filter((j) => j.gate !== r.gate),
      { ...r, scope: hash },
    ];
  if (rulingPath)
    keepRound(
      env.paths,
      work.id,
      gate.round,
      records.map((r) => r.gate),
      rulingPath,
      task,
    );
  settleTaskState(work, record, env.policy);
  saveWork(env.paths, work);
  const pending = taskPending(work, record, env.policy);
  const lines = records.map((r) => {
    const detail =
      r.verdict === "not-run" ? `: ${r.reason}` : ` (${findingsText(r.findings.length)})`;
    return `${task}: ${r.gate} ${verdictWord(r.verdict)}${detail}`;
  });
  // A briefed todo whose judgement is pending again says so, never "gated" (finding 75).
  lines.push(
    pending.length === 0
      ? `${task}: gated`
      : record.state === "briefed"
        ? `${task}: briefed, judgement pending (${pendingText(record, pending)})`
        : `${task}: not gated: ${pendingText(record, pending)}`,
  );
  return {
    code: pending.length === 0 ? 0 : 1,
    stdout: true,
    text: lines.join("\n"),
    data: { task: record, gate: record.gate, pending },
  };
}

function guardContext(env: Env, work: WorkItem, tampered: boolean): GuardContext {
  const dir = workDir(env.paths, work.id);
  const result = assess(env.paths, work, env.profile, env.policy, env.tampered || tampered);
  return {
    specText: readText(join(dir, "spec.md")),
    analysisText: readText(join(dir, "analysis.md")),
    originRecorded: existsSync(join(dir, "analysis", "origin.json")),
    gitRepository: isGitRepo(env.paths.root),
    conclaveText: readText(join(dir, "conclave.md")),
    ledger: loadLedger(env.paths, work.id).ledger,
    planExists: existsSync(join(dir, "plan.md")),
    evidence: result.evidence,
    proven: result.verdict === "proven",
    unproven: result.unproven,
    policy: env.policy,
  };
}

/**
 * A proving step is also the work's delivery: the phase moves as far as the guards allow (a gate run
 * is the work entering its gate phase; an item already in gate is delivered by the step that proves
 * it, finding 18) and the report is written. Shared by the gate run and the judgement record.
 */
function deliver(env: Env, opened: Opened, evidence: Evidence): void {
  for (const target of ["gate", "deliver"] as const) {
    if (nextPhaseOf(opened.work) !== target) continue;
    if (!advancePhase(opened.work, guardContext(env, opened.work, opened.tampered)).ok) break;
  }
  saveWork(env.paths, opened.work);
  writeProtectedText(
    env.paths,
    join(workDir(env.paths, opened.work.id), "report.md"),
    reportOf(env, opened.work, evidence),
  );
}

/** The item's report: its evidence, its objections, its mail and the name this project carries in the mail. */
function reportOf(env: Env, work: WorkItem, evidence: Evidence): string {
  return renderReport(
    work,
    evidence,
    env.policy,
    loadLedger(env.paths, work.id).ledger,
    loadItemMail(env.paths, work.id),
    env.mail.self.project,
  );
}

/** The item's priority at start (SP7 §7.1, SP3 Task 2): the flag, else the origin's confirmed level, else the `priority` answer's level, else normal. */
function startPriority(
  flag: MailPriority | undefined,
  origin: Message | null,
  answers: Answers,
): MailPriority {
  if (flag) return flag;
  if (origin) return decidedPriority(origin);
  if (answers.priority !== undefined) return PRIORITY_LEVELS[answers.priority] ?? "normal";
  return "normal";
}

/**
 * The item's priority with its triage (SP7 §10.2): the start prints the decision in full; the
 * status (`short`) prints the level alone unless the proposal is still unconfirmed.
 */
function triageText(work: WorkItem, short = false): string {
  const t = work.triage;
  const level = `priority ${work.priority ?? "normal"}`;
  if (!t) return level;
  if (t.confirmed === null)
    return `priority ${t.proposed} (proposed, unconfirmed: no signed business priorities)`;
  if (short) return level;
  if (t.confirmed === t.proposed)
    return `priority ${t.confirmed} (confirmed against the signed business priorities)`;
  return `priority ${t.confirmed} (proposed ${t.proposed}, against the signed business priorities): ${t.reason ?? ""}`;
}

function logDecision(env: Env, work: WorkItem, answers: Answers): void {
  if (!env.config.decisions.log) return;
  const line = JSON.stringify({
    at: nowIso(),
    work: work.id,
    input: work.input.slice(0, 500),
    answers,
    route: work.route,
    reasons: work.routeReasons,
    // The kind and its derivation (SP7 §7.1), replayed with the nine answers.
    kind: work.kind,
    kindFrom: work.kindFrom,
  });
  const file = join(env.paths.localDir, "decisions.jsonl");
  writeText(file, `${readText(file) ?? ""}${line}\n`);
}

function parseAnswers(raw: string): Answers | Outcome {
  try {
    return validateAnswers(JSON.parse(raw));
  } catch (error) {
    if (error instanceof AnswerError) return refuse(`invalid answers: ${error.message}`);
    return refuse("answers must be valid JSON");
  }
}

function classify(env: Env, work: WorkItem, answers: Answers, context: KindContext): void {
  const decision = computeRoute(answers, [], env.policy);
  applyClassification(work, answers.work_type, decision, kindOf(answers, context));
  logDecision(env, work, answers);
}

function gateSummary(
  work: WorkItem,
  verdict: string,
  unproven: string[],
  runs: { gate: string; target: string; stack?: string; status: string; durationMs: number }[],
): string {
  const lines = runs.map(
    (r) =>
      `  ${r.gate} (${r.target}${r.stack ? `, ${r.stack}` : ""}): ${r.status} in ${(r.durationMs / 1000).toFixed(1)}s`,
  );
  lines.push(verdict === "proven" ? `Proven: ${work.id}` : `Not proven: ${unproven.join("; ")}`);
  return lines.join("\n");
}

async function dispatch(parsed: Parsed, io: CliIo): Promise<Outcome> {
  const [command, ...args] = parsed.positional;
  if (parsed.flags.version || command === "version") return ok(VERSION, { version: VERSION });
  if (command === "hook") {
    const event = args[0] ?? "";
    let payload: Record<string, unknown> = {};
    try {
      const raw = await io.stdin();
      payload = raw.trim() ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      payload = {};
    }
    if (typeof payload.cwd !== "string") payload.cwd = io.cwd;
    return ok(JSON.stringify(handleHook(event, payload as HookPayload, io.env)), {
      hookEvent: event,
    });
  }
  const badFlag = unknownFlag(command ?? "help", parsed);
  if (badFlag) return badFlag;
  if (!command || command === "help") return ok(HELP);
  if (command === "mode" || command === "config")
    return settings(command, args, { userDir: userDirOf(io.env) });
  let paths = resolvePaths(io.cwd, io.env);
  if (!paths && command === "detect") {
    // `crew detect` is how a folder without git becomes a crew project.
    ensureDir(join(resolve(io.cwd), ".crew"));
    paths = resolvePaths(io.cwd, io.env);
  }
  if (!paths) return refuse(INACTIVE);
  const env = load(paths, io.env);

  switch (command) {
    case "detect": {
      if (parsed.flags.refresh) {
        const refused = tamperRefusal(env);
        if (refused) return refused;
      }
      const previous = parsed.flags.refresh ? loadProfile(env.paths).profile : null;
      const profile = parsed.flags.refresh ? detectProfile(env.paths.root, previous) : env.profile;
      if (parsed.flags.refresh) {
        saveProfile(env.paths, profile);
        // Only bless a policy that has no recorded hash yet: re-recording here would let a tampered policy
        // pass as trusted. `crew policy accept` is the user-approved way to accept a hand edit.
        if (integrityOf(env.paths)[".crew/policy.json"] === undefined) {
          recordIntegrity(env.paths, join(env.paths.crewDir, "policy.json"));
        }
      }
      const missing = missingTestCommands(profile);
      const lines = profile.targets.map(
        (t) =>
          `  ${t.path} (${t.stack}, ${t.packageManager}${t.workspaceOf ? `, workspace of ${t.workspaceOf}` : ""}): ${
            Object.entries(t.gates)
              .map(([g, c]) => `${g}=${c.command}${c.source === "proposed" ? " [proposed]" : ""}`)
              .join(", ") || "no commands"
          }`,
      );
      if (missing.length)
        lines.push(
          `No test command for: ${missing.map((m) => m.target).join(", ")}. Propose one: crew profile set test "<cmd>" [--target <path>]`,
        );
      // A project the fixtures scaffold is known to the mail before any session runs in it: this
      // command registered it on its way in (`load`), and says so.
      const entry = env.registered;
      lines.push(`registered ${entry.name} (workspace ${entry.workspace ?? "none"})`);
      return ok(lines.join("\n"), { profile, missing, registered: entry });
    }
    case "profile": {
      const [sub, gate, cmd] = args;
      if (sub === "set" || sub === "confirm") {
        const refused = tamperRefusal(env);
        if (refused) return refused;
      }
      if (sub === "set" && gate?.startsWith("environment.")) {
        // The environment, key by key (SP7 §8.2): a command is confirmed as it is set, a value is
        // taken as given; a block absent is created around the key, start and health still to come.
        const key = gate.slice("environment.".length);
        if (!ENVIRONMENT_KEYS.includes(key as EnvironmentKey) || !cmd)
          return refuse(
            'usage: crew profile set environment.<start|health|stop|logs|url|timeout> "<value>"',
          );
        const block: Environment = env.profile.environment ?? {
          start: { command: "", source: "proposed" },
          health: { command: "", source: "proposed" },
          timeoutMs: ENVIRONMENT_TIMEOUT_MS,
        };
        let printed: string;
        if (key === "timeout") {
          const seconds = Number(cmd);
          if (!Number.isFinite(seconds) || seconds < 1)
            return refuse("environment.timeout is at least 1 second");
          block.timeoutMs = Math.round(seconds * 1000);
          printed = `environment.timeout set: ${seconds} s`;
        } else if (key === "logs" || key === "url") {
          block[key] = cmd;
          printed = `environment.${key} set: ${cmd}`;
        } else {
          block[key as "start" | "health" | "stop"] = { command: cmd, source: "confirmed" };
          printed = `environment.${key} set and confirmed: ${cmd}`;
        }
        env.profile.environment = block;
        saveProfile(env.paths, env.profile);
        return ok(printed, { environment: block });
      }
      if (sub === "confirm" && gate === "environment") {
        const block = env.profile.environment;
        if (!block) return refuse(NO_ENVIRONMENT);
        const confirmed: string[] = [];
        for (const key of ["start", "health", "stop"] as const) {
          const command = block[key];
          if (command?.source === "proposed" && command.command.trim()) {
            command.source = "confirmed";
            confirmed.push(`environment.${key}: ${command.command}`);
          }
        }
        saveProfile(env.paths, env.profile);
        return ok([`confirmed ${confirmed.length} command(s)`, ...confirmed].join("\n  "), {
          confirmed: confirmed.length,
          commands: confirmed,
        });
      }
      if (sub === "set" && gate === "testScoped") {
        // The scoped test template of a target (SP7 §8.1): the user's, confirmed as it is set.
        if (!cmd)
          return refuse(
            'usage: crew profile set testScoped "<cmd with {files}>" [--target <path>]',
          );
        if (!cmd.includes("{files}"))
          return refuse("a scoped test command names where the files go: {files}");
        const targetPath = typeof parsed.flags.target === "string" ? parsed.flags.target : ".";
        const target = env.profile.targets.find((t) => t.path === targetPath);
        if (!target) return refuse(`no target at ${targetPath} in the profile (crew detect)`);
        target.testScoped = { command: cmd, source: "confirmed" };
        saveProfile(env.paths, env.profile);
        return ok(`testScoped for ${targetPath} set and confirmed: ${cmd}`, {
          target: targetPath,
          testScoped: cmd,
        });
      }
      if (sub === "set") {
        if (!GATE_NAMES.includes(gate as GateName) || gate === "secrets" || !cmd)
          return refuse(
            'usage: crew profile set <build|test|lint|typecheck|deps|e2e> "<cmd>" [--target <path>]',
          );
        const targetPath = typeof parsed.flags.target === "string" ? parsed.flags.target : ".";
        const stackFlag = parsed.flags.stack;
        if (stackFlag !== undefined && !STACKS.includes(stackFlag as Stack))
          return refuse(`usage: crew profile set <gate> "<cmd>" --stack <${STACKS.join("|")}>`);
        const stack = stackFlag as Stack | undefined;
        // The person says minutes; the profile keeps milliseconds (finding 23: a flow may take twenty).
        const timeoutFlag = parsed.flags.timeout;
        const minutes = typeof timeoutFlag === "string" ? Number(timeoutFlag) : undefined;
        if (
          timeoutFlag !== undefined &&
          !(minutes !== undefined && minutes > 0 && Number.isFinite(minutes))
        )
          return refuse(
            'usage: crew profile set <gate> "<cmd>" --timeout <minutes> (a positive number)',
          );
        // Two manifests in one folder are two targets at one path; the stack says which one is meant.
        const atPath = env.profile.targets.filter((t) => t.path === targetPath);
        if (stack === undefined && atPath.length > 1) {
          const stacks = atPath.map((t) => t.stack);
          return refuse(
            `two targets at ${targetPath} (${stacks.join(", ")}): say which one with --stack <${stacks.join("|")}>`,
          );
        }
        let target = stack === undefined ? atPath[0] : atPath.find((t) => t.stack === stack);
        if (!target) {
          target = {
            path: targetPath,
            stack: stack ?? "other",
            packageManager: "unknown",
            gates: {},
            timeoutMs: 10 * 60 * 1000,
          };
          env.profile.targets.push(target);
        }
        const where = stack === undefined ? targetPath : `${targetPath} (${stack})`;
        const current = target.gates[gate as GateName];
        // One step, one decision (0.3.0): the command is the user's and confirmed as it is set. A
        // command a person already confirmed is replaced only on purpose.
        if (current?.source === "confirmed" && !parsed.flags.force)
          return refuse(
            `${gate} for ${where} already has a confirmed command (${current.command}); replacing it needs --force: crew profile set ${gate} "<cmd>" --force`,
          );
        target.gates[gate as GateName] = {
          command: cmd,
          source: "confirmed",
          ...(minutes ? { timeoutMs: Math.round(minutes * 60 * 1000) } : {}),
        };
        saveProfile(env.paths, env.profile);
        return ok(`${gate} for ${where} set and confirmed: ${cmd}`, {
          target: targetPath,
          ...(stack ? { stack } : {}),
          gate,
          command: cmd,
        });
      }
      if (sub === "confirm") {
        if (gate !== undefined && !GATE_NAMES.includes(gate as GateName))
          return refuse("usage: crew profile confirm [<gate>]");
        // The user sees exactly what they are trusting.
        const confirmed: string[] = [];
        for (const target of env.profile.targets)
          for (const [name, command] of Object.entries(target.gates))
            if (command.source === "proposed" && (gate === undefined || name === gate)) {
              command.source = "confirmed";
              confirmed.push(`${name}: ${command.command}`);
            }
        saveProfile(env.paths, env.profile);
        return ok([`confirmed ${confirmed.length} command(s)`, ...confirmed].join("\n  "), {
          confirmed: confirmed.length,
          commands: confirmed,
        });
      }
      return refuse("usage: crew profile set|confirm");
    }
    case "policy": {
      if (args[0] === "accept") return accept(env, "policy");
      if (args[0] === "set") {
        const [, key, value] = args;
        if (!key || value === undefined) {
          return refuse(
            `usage: crew policy set <${Object.keys(SETTABLE_POLICY_KEYS).join("|")}> <value>`,
          );
        }
        // Asked even under relay (PreToolUse): the policy that governs signatures is signed by a prompt.
        const result = setPolicyValue(env.paths, key, value);
        if ("refused" in result) return refuse(result.refused);
        // The standing grant is the second loosening a policy may carry (SP7b decision 15): on record.
        if (key === "team.continuations" && value === "granted")
          appendDecision(env.paths, {
            at: nowIso(),
            item: "policy",
            kind: "decision",
            text: "team.continuations set to granted: rounds past a cap are the user's standing grant, up to the cap plus two",
            by: "the user",
          });
        return ok(`policy ${key}: ${value}`, result);
      }
      return refuse("usage: crew policy accept | crew policy set <key> <value>");
    }
    case "accept": {
      if (!args[0]) return refuse("usage: crew accept <id|profile|policy|decisions>");
      return accept(env, args[0]);
    }
    case "start": {
      const input = args.join(" ").trim();
      if (!input) return refuse(`usage: crew start "<request>" --answers '<json>'`);
      // The route comes from the typed answers; without them every item would sit on a default route.
      if (typeof parsed.flags.answers !== "string")
        return refuse(
          "answers are required: answer the nine typed questions from the crew skill (references/receive.md) and pass them with --answers",
        );
      // Validate before creating anything, so a bad answer set leaves no half-made work item behind.
      const answers = parseAnswers(parsed.flags.answers);
      if (isOutcome(answers)) return answers;
      if (answers.work_type === "question")
        return ok("question: answer the user; no work item is created", { id: null });
      // An item that answers a message (a session opened by mail, SP2c §7, §8): the message must be
      // in this project's inbox and addressed to this agent, checked before anything is created.
      const originId = typeof parsed.flags.origin === "string" ? parsed.flags.origin : null;
      const inbox = originId ? ownInbox(env.mail) : null;
      if (inbox?.tampered) return refuse(tamperedBox(env.mail.self.project, "inbox"));
      const origin = inbox?.messages.find((m) => m.id === originId) ?? null;
      if (originId && !origin)
        return refuse(`no message ${originId} addressed to this session (crew mail inbox)`);
      // The item's priority (SP7 §7.1): given, else the origin's confirmed one, else normal; a value
      // that is not one of the four is refused before anything is created.
      const priorityFlag: unknown = parsed.flags.priority;
      if (priorityFlag !== undefined && !isMailPriority(priorityFlag))
        return refuse(badPriority(priorityFlag));
      // Where the request entered from (SP7 §10.1) and the triage of its proposed priority against
      // the business priorities the user signed (§10.2), both checked before anything is created.
      const source =
        typeof parsed.flags.source === "string"
          ? parseSource(parsed.flags.source, env.paths.root)
          : null;
      if (source && "refused" in source) return refuse(source.refused);
      const reasonFlag = typeof parsed.flags.reason === "string" ? parsed.flags.reason : undefined;
      if (reasonFlag !== undefined && !source?.proposedPriority)
        return refuse("--reason goes with a source's proposed priority");
      let triage: Triage | null = null;
      if (source?.proposedPriority) {
        const workspace = env.mail.self.workspace;
        const state = workspace ? prioritiesState(env.paths.userDir, workspace).state : "none";
        const decided = triagePriority(
          source.proposedPriority,
          priorityFlag,
          reasonFlag,
          state,
          env.mail.self.agent,
        );
        if ("refused" in decided) return refuse(decided.refused);
        triage = decided;
      }
      const previous = activeWork(env.paths);
      const previousProven =
        !!previous?.work &&
        assess(env.paths, previous.work, env.profile, env.policy, env.tampered || previous.tampered)
          .verdict === "proven";
      const warning =
        previous?.work && !previousProven
          ? `warning: ${previous.work.id} is not proven and is no longer the active work item\n`
          : "";
      // The change is measured from HEAD, so whatever is uncommitted now is measured with it,
      // unless an earlier item proved it: then the new item starts from that proven state.
      const uncommitted = isGitRepo(env.paths.root)
        ? changedWatchedPaths(env.paths.root, env.profile)
        : [];
      const baseFiles = previousProven ? hashPaths(env.paths.root, uncommitted) : {};
      const inherited = previousProven ? [] : uncommitted;
      const inheritedWarning = inherited.length
        ? `warning: uncommitted changes in ${inherited.join(", ")} count as this item's change; commit them first if they are not\n`
        : "";
      const provenNote =
        previousProven && uncommitted.length && previous?.work
          ? `note: uncommitted changes in ${uncommitted.join(", ")} are ${previous.work.id}'s proven work and not this item's\n`
          : "";
      // Other items still being worked on, while the tree holds uncommitted changes: a second
      // session on one checkout (finding 9). The proof covers the whole tree, so the record says so.
      const neighbours = uncommitted.length ? openItems(env.paths).map((w) => w.id) : [];
      const work = createWork(env.paths, input, baseFiles, source ?? undefined);
      if (neighbours.length)
        work.sharedCheckout = { with: neighbours, paths: uncommitted, at: work.createdAt };
      const sharedWarning = neighbours.length
        ? `warning: this checkout is shared with ${neighbours.join(", ")}, which ${neighbours.length === 1 ? "is" : "are"} open with uncommitted changes in ${uncommitted.join(", ")}; a second session on one checkout blocks turn ends and proves half-written code: work in a worktree (git worktree add ../<name> -b <branch>)\n`
        : "";
      classify(env, work, answers, { origin: !!origin, sourceChannel: source?.channel ?? null });
      // The item's priority: the triage's level when a source proposed one (the proposal while
      // unconfirmed), else the flag, the origin's confirmed level, the priority answer's level, normal.
      if (triage) {
        work.triage = triage;
        work.priority = triage.confirmed ?? triage.proposed;
      } else work.priority = startPriority(priorityFlag, origin, answers);
      // The seats the route plans, before any path is known (SP7 §6.2): the leads' validation guard
      // names them from here; the gate run rewrites them with the paths the change touched.
      if (work.route !== "fast") {
        work.seats = plannedSeats(work.route, work.riskAreas, [], env.policy);
        work.primaryTeam = "backend";
      }
      if (origin) {
        work.origin = { mail: origin.id };
        // A change request from this project to one of its tasks: the item is an implementer's child.
        if (
          origin.type === "change-request" &&
          origin.from.project === env.mail.self.project &&
          origin.from.item &&
          origin.to.agent &&
          TASK_AGENT.test(origin.to.agent)
        ) {
          work.parent = {
            project: origin.from.project,
            item: origin.from.item,
            task: origin.to.agent,
            root: worktreeMainRoot(env.paths.root) ?? env.paths.root,
          };
        }
      }
      // Both flags repeat and keep their command-line order, so the numbers read as typed.
      const criteria = parsed.ordered
        .filter((f) => f.key === "criterion" || f.key === "preserve")
        .map((f) => addCriterion(work, f.value, f.key === "preserve" ? "preserve" : "behavior"));
      // On the fast route the criteria are all that stands before build; with them given, go there.
      if (work.route === "fast" && criteria.length > 0)
        advancePhase(work, guardContext(env, work, false));
      saveWork(env.paths, work);
      // A lowering is the lead's decision about the item (SP7 §10.2, §6.6).
      if (triage?.confirmed && triage.confirmed !== triage.proposed)
        appendDecision(env.paths, {
          at: triage.at,
          item: work.id,
          kind: "triage",
          text: `priority lowered from ${triage.proposed} to ${triage.confirmed}: ${triage.reason ?? ""}`,
          by: triage.by,
        });
      const originNotes: string[] = [];
      if (origin) {
        // The message is taken on: in progress on every copy (SP7 §9); the new item keeps its copy as it now stands.
        const moved = moveMail(env.mail, origin.id, "in-progress", {}, originNotes);
        if ("refused" in moved) originNotes.push(moved.refused);
        recordInItem(env.paths, work.id, "refused" in moved ? origin : moved);
      }
      const lines = criteria.map((c) => `\n  ${c.id} (${c.kind}): ${c.text}`).join("");
      // The kind and where it came from (SP7 §7.1); an issue is told what comes before its build (rule 11).
      const kindLine = `\n  ${kindLabel(work)}${
        work.kind === "issue"
          ? "\n  issue: analysis.md (Origin, Cause, Blast radius) and a preserve criterion before build (references/analyse.md)"
          : ""
      }`;
      // The source and the triage (SP7 §10): where the request came from and what the lead decided of its priority.
      const sourceLines = source ? `\n  source: ${sourceLine(source)}` : "";
      const triageLine = triage ? `\n  ${triageText(work)}` : "";
      const teamLine = work.seats?.length
        ? `\n  team: ${work.seats.length} seats (crew team ${work.id})`
        : "";
      // What this project decided before (SP7 §6.6): the lead reads it in Understand.
      const registered = decisionsCount(env.paths);
      const registerLine = registered
        ? `\n  decision register: ${registered} entr${registered === 1 ? "y" : "ies"} (crew decisions)`
        : "";
      return ok(
        `${warning}${sharedWarning}${inheritedWarning}${provenNote}started ${work.id} (route ${work.route}: ${work.routeReasons.join("; ")})${kindLine}${sourceLines}${triageLine}${lines}${teamLine}${registerLine}${originNotes.length ? `\n${originNotes.join("\n")}` : ""}`,
        {
          id: work.id,
          route: work.route,
          kind: work.kind,
          kindFrom: work.kindFrom,
          priority: work.priority,
          source: work.source ?? null,
          triage: work.triage ?? null,
          phase: work.phase,
          routeReasons: work.routeReasons,
          replaced: warning ? previous?.work?.id : null,
          criteria,
          inherited,
          shared: work.sharedCheckout ?? null,
          proven:
            previousProven && previous?.work ? { of: previous.work.id, paths: uncommitted } : null,
        },
      );
    }
    case "classify": {
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened)) return opened;
      if (typeof parsed.flags.answers !== "string")
        return refuse("usage: crew classify <id> --answers <json>");
      const answers = parseAnswers(parsed.flags.answers);
      if (isOutcome(answers)) return answers;
      classify(env, opened.work, answers, { origin: !!opened.work.origin, sourceChannel: null });
      saveWork(env.paths, opened.work);
      return ok(
        `${opened.work.id}: route ${opened.work.route} (${opened.work.routeReasons.join("; ")}); ${kindLabel(opened.work)}`,
        {
          id: opened.work.id,
          route: opened.work.route,
          kind: opened.work.kind,
          kindFrom: opened.work.kindFrom,
          riskAreas: opened.work.riskAreas,
        },
      );
    }
    case "criteria": {
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened)) return opened;
      if (args[1] === "remove" && args[2]) {
        const { evidence } = loadEvidence(env.paths, opened.work.id);
        const outcome = removeCriterion(
          opened.work,
          evidence,
          args[2],
          loadLedger(env.paths, opened.work.id).ledger,
        );
        if ("refused" in outcome) return refuse(outcome.refused);
        saveWork(env.paths, opened.work);
        const { removed } = outcome;
        return ok(`${removed.id} (${removed.kind}) removed: ${removed.text}`, { removed });
      }
      const text = args.slice(2).join(" ").trim();
      if (args[1] !== "add" || !text)
        return refuse(
          'usage: crew criteria <id> add "<criterion>" [--kind preserve|observed] | crew criteria <id> remove <AC-n>',
        );
      const kind =
        parsed.flags.kind === "preserve" || parsed.flags.kind === "observed"
          ? parsed.flags.kind
          : "behavior";
      // A criterion bound to a contract of a reply in the item's mail (SP7 §9): the message and
      // the index name a well-formed contract, else nothing is recorded.
      let contract: Criterion["contract"] | undefined;
      if (typeof parsed.flags.contract === "string") {
        const match = /^(\S+):(\d+)$/.exec(parsed.flags.contract);
        const message = match?.[1] ?? parsed.flags.contract;
        const index = Number(match?.[2] ?? 0);
        const held = MESSAGE_ID.test(message)
          ? loadItemMail(env.paths, opened.work.id).box.messages.find((m) => m.id === message)
          : undefined;
        if (!held || index < 1 || readContracts(held).length < index)
          return refuse(
            `no contract ${index || parsed.flags.contract} on ${message} in this item's mail`,
          );
        contract = { message, index };
      }
      const criterion = addCriterion(opened.work, text, kind, contract);
      saveWork(env.paths, opened.work);
      return ok(`${criterion.id} (${kind}): ${criterion.text}`, { criterion });
    }
    case "objection": {
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened)) return opened;
      const { ledger } = loadLedger(env.paths, opened.work.id);
      const usage =
        'usage: crew objection <id> add "<text>" --by <role> --severity blocking|advisory | resolve O-n --criterion AC-k | waive O-n --reason "<why>" [--mode <mode>]';
      if (args[1] === "add") {
        const text = args.slice(2).join(" ").trim();
        const by = typeof parsed.flags.by === "string" ? parsed.flags.by.trim() : "";
        const severity = parsed.flags.severity;
        if (!text || !by) return refuse(usage);
        if (severity !== "blocking" && severity !== "advisory")
          return refuse("severity is blocking or advisory");
        const objection = addObjection(ledger, text, by, severity);
        saveLedger(env.paths, opened.work.id, ledger);
        return ok(`${objection.id} (${severity}, raised by ${by}): ${objection.text}`, {
          objection,
        });
      }
      if (args[1] === "resolve" && args[2]) {
        if (typeof parsed.flags.criterion !== "string") return refuse(usage);
        const result = bindObjection(ledger, opened.work, args[2], parsed.flags.criterion);
        if ("refused" in result) return refuse(result.refused);
        saveLedger(env.paths, opened.work.id, ledger);
        appendDecision(env.paths, {
          at: nowIso(),
          item: opened.work.id,
          kind: "objection",
          id: result.id,
          text: result.text,
          answer: `resolved by ${result.criterion}`,
          by: "the engine",
        });
        return ok(`${result.id} is resolved when ${result.criterion} is proven`, {
          objection: result,
        });
      }
      if (args[1] === "waive" && args[2]) {
        const reason = typeof parsed.flags.reason === "string" ? parsed.flags.reason.trim() : "";
        if (!reason) return refuse(usage);
        const decision = decisionFlag(parsed, env.policy);
        if (isOutcome(decision)) return decision;
        const result = waiveObjection(ledger, args[2], reason, decision);
        if ("refused" in result) return refuse(result.refused);
        saveLedger(env.paths, opened.work.id, ledger);
        const waiver = result.waived ?? { by: "user" as const };
        appendDecision(env.paths, {
          at: nowIso(),
          item: opened.work.id,
          kind: "objection",
          id: result.id,
          text: result.text,
          answer: `waived: ${reason}`,
          by: whoDecided(waiver),
        });
        return ok(
          `${result.id} waived ${decidedBy(waiver)}${countedNote(env.policy, waiver)}: ${reason}`,
          { objection: result },
        );
      }
      return refuse(usage);
    }
    case "decision": {
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened)) return opened;
      const question = args.slice(2).join(" ").trim();
      if (args[1] !== "add" || !question)
        return refuse('usage: crew decision <id> add "<question>" [--default "<answer>"]');
      const dflt = typeof parsed.flags.default === "string" ? parsed.flags.default : undefined;
      const decision = addDecision(opened.work, question, dflt);
      saveWork(env.paths, opened.work);
      return ok(`${decision.id}: ${decision.question}${dflt ? ` (default: ${dflt})` : ""}`, {
        decision,
      });
    }
    case "debate": {
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened)) return opened;
      const usage =
        'usage: crew debate <id> open --reason "<why>" | crew debate <id> close [--tokens n]';
      if (args[1] === "open") {
        const reason = typeof parsed.flags.reason === "string" ? parsed.flags.reason.trim() : "";
        if (!reason) return refuse(usage);
        const result = openDebate(opened.work, reason);
        if ("refused" in result) return refuse(result.refused);
        saveWork(env.paths, opened.work);
        return ok(`debate open on ${opened.work.id}: ${result.reason}`, { debate: result });
      }
      if (args[1] === "close") {
        const flag = parsed.flags.tokens;
        const tokens =
          flag === undefined ? undefined : typeof flag === "string" ? Number(flag) : Number.NaN;
        if (tokens !== undefined && !(Number.isFinite(tokens) && tokens >= 0))
          return refuse("--tokens is a number");
        const result = closeDebate(opened.work, tokens);
        if ("refused" in result) return refuse(result.refused);
        saveWork(env.paths, opened.work);
        return ok(
          `debate closed on ${opened.work.id}${tokens !== undefined ? ` (${tokens} tokens)` : ""}`,
          { debate: result },
        );
      }
      return refuse(usage);
    }
    case "decide": {
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened)) return opened;
      const id = args[1];
      if (!id)
        return refuse(
          'usage: crew decide <id> D-n "<answer>" [--mode <mode> --validator stated-default]',
        );
      const who = validatorFlag(parsed, env.policy);
      if (isOutcome(who)) return who;
      if (who.by === "validator" && who.rule !== "stated-default")
        return refuse(
          "a decision's default is taken by the validator under the stated-default rule",
        );
      const answer = args.slice(2).join(" ").trim() || undefined;
      const result = answerDecision(opened.work, id, answer, who);
      if ("refused" in result) return refuse(result.refused);
      saveWork(env.paths, opened.work);
      appendDecision(env.paths, {
        at: nowIso(),
        item: opened.work.id,
        kind: "decision",
        id: result.id,
        text: result.question,
        ...(result.answer ? { answer: result.answer } : {}),
        by: whoDecided(result),
      });
      return ok(`${result.id} answered ${decidedBy(result)}: ${result.answer}`, {
        decision: result,
      });
    }
    case "approve": {
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened)) return opened;
      if (args[1] !== "spec")
        return refuse(
          "usage: crew approve <id> spec [--mode <mode> [--validator complete-gap-round]]",
        );
      // Nothing of the full route goes past the spec in a session opened by mail (SP2c §8, §10):
      // the item waits for a person, and the message says so to whoever sent it.
      const openedBy = env.mail.self.openedBy;
      if (openedBy && opened.work.route === "full") {
        opened.work.awaiting = "user";
        saveWork(env.paths, opened.work);
        // The opener's id comes from the session's variables or the engine's record of the checkout: only a message this inbox holds is marked.
        const notes: string[] = [];
        if (ownInbox(env.mail).messages.some((m) => m.id === openedBy)) {
          const moved = moveMail(env.mail, openedBy, "blocked", {}, notes);
          if ("refused" in moved) notes.push(moved.refused);
        }
        return refuse(
          `a full-route item opened by mail (${openedBy}) waits for a person at its spec; the item is marked waiting for the user and the message blocked${notes.length ? `; ${notes.join("; ")}` : ""}`,
        );
      }
      const decision = validatorFlag(parsed, env.policy);
      if (isOutcome(decision)) return decision;
      if (decision.by === "validator") {
        // The engine checks the rule's mechanical part before anything is recorded (SP2 §9).
        if (decision.rule !== "complete-gap-round")
          return refuse("a spec is approved by the validator under the complete-gap-round rule");
        const missing = validatorPreconditions(
          decision.rule,
          opened.work,
          guardContext(env, opened.work, opened.tampered),
        );
        if (missing.length)
          return refuse(
            `the complete-gap-round rule does not hold; missing:\n  ${missing.join("\n  ")}`,
            { missing },
          );
      }
      approve(opened.work, "spec", decision);
      appendDecision(env.paths, {
        at: nowIso(),
        item: opened.work.id,
        kind: "approval",
        text: "spec approved",
        by: whoDecided(decision),
      });
      saveWork(env.paths, opened.work);
      return ok(`spec approved for ${opened.work.id} ${decisionText(env.policy, decision)}`, {
        approvals: opened.work.approvals,
      });
    }
    case "phase": {
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened)) return opened;
      if (args[1] !== "next") return refuse("usage: crew phase <id> next");
      const result = advancePhase(opened.work, guardContext(env, opened.work, opened.tampered));
      if (!result.ok)
        return refuse(`cannot enter the next phase; missing:\n  ${result.missing.join("\n  ")}`, {
          missing: result.missing,
          phase: opened.work.phase,
        });
      saveWork(env.paths, opened.work);
      return ok(`${opened.work.id}: phase ${result.phase}`, { phase: result.phase });
    }
    case "await":
    case "resume": {
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened)) return opened;
      const usage = "usage: crew await <id> user | role | mail <message id>";
      // The request this item answers follows its waits (SP7 §9): blocked while the turn ends on
      // one, in progress again at the resume; a message past that point (done) is left as it is.
      const originNotes: string[] = [];
      const moveOrigin = (to: "blocked" | "in-progress") => {
        const originId = opened.work.origin?.mail;
        if (!originId) return;
        const current = ownInbox(env.mail).messages.find((m) => m.id === originId);
        if (!current || mailStatus(current) === to) return;
        const moved = moveMail(env.mail, originId, to, {}, originNotes);
        if ("refused" in moved) originNotes.push(moved.refused);
      };
      const withNotes = (text: string) =>
        originNotes.length ? `${text}\n${originNotes.join("\n")}` : text;
      if (command === "resume") {
        opened.work.awaiting = null;
        delete opened.work.awaitingMessage;
        saveWork(env.paths, opened.work);
        moveOrigin("in-progress");
        return ok(withNotes(`${opened.work.id}: resumed`), {
          awaiting: null,
          awaitingMessage: null,
        });
      }
      // The three waits a turn may end on (SP2c §9): the user, the roles, a reply to a message.
      const kind = args[1];
      if (kind !== "user" && kind !== "role" && kind !== "mail") return refuse(usage);
      if (kind === "mail" && !args[2]) return refuse(usage);
      opened.work.awaiting = kind;
      if (kind === "mail") opened.work.awaitingMessage = args[2];
      else delete opened.work.awaitingMessage;
      saveWork(env.paths, opened.work);
      moveOrigin("blocked");
      return ok(withNotes(`${opened.work.id}: ${waitingText(opened.work).slice(2)}`), {
        awaiting: kind,
        awaitingMessage: opened.work.awaitingMessage ?? null,
      });
    }
    case "tdd": {
      const [step, id, criterion] = args;
      const opened = openForChange(env, id);
      if (isOutcome(opened)) return opened;
      if (!["red", "green", "before", "after", "observed"].includes(step ?? "") || !criterion)
        return refuse(
          'usage: crew tdd <red|green|before|after|observed> <id> <criterion> [--reason "<why>"] [-- <cmd>]',
        );
      const { evidence } = loadEvidence(env.paths, opened.work.id);
      const override = parsed.rest.length ? parsed.rest.join(" ") : undefined;
      const reason = typeof parsed.flags.reason === "string" ? parsed.flags.reason : undefined;
      const outcome = await recordTdd(
        env.paths,
        opened.work,
        evidence,
        env.profile,
        criterion,
        step as TddStep,
        override,
        reason,
      );
      const tail = outcome.record?.tail ? `\n${outcome.record.tail}` : "";
      if (!outcome.ok) return refuse(`${outcome.message}${tail}`, { record: outcome.record });
      // The record goes into the evidence as it stands now, under the lock (finding 81): a run that
      // took minutes merges with what landed meanwhile. A refusal (the file edited outside the engine
      // during the run, a lock held) records nothing and says the run passed and where its log is.
      const saved = updateEvidence(env.paths, opened.work.id, outcome.apply);
      if ("refused" in saved)
        return refuse(
          `${saved.refused} (the ${step} run passed: ${outcome.record?.log ?? "no log"})`,
          { record: outcome.record },
        );
      return ok(outcome.message, { record: outcome.record });
    }
    case "gate": {
      const opened = openForChange(env, args[1]);
      if (isOutcome(opened)) return opened;
      if (args[0] !== "run") return refuse("usage: crew gate run <id> [--only a,b]");
      const only =
        typeof parsed.flags.only === "string"
          ? parsed.flags.only
              .split(",")
              .map((g) => g.trim())
              .filter(Boolean)
          : undefined;
      const unknown = only?.find(
        (g) => !GATE_NAMES.includes(g as GateName) && !isJudgementGateName(g),
      );
      if (unknown !== undefined) return refuse(`unknown gate: ${unknown}`);
      // The profile follows the manifests before the gates are planned: a script or a lockfile the
      // work added is picked up here, with no detect --refresh and no profile set (finding 23).
      const refreshed = refreshProfile(env.paths, env.profile, env.tampered);
      env.profile = refreshed.profile;
      const outcome = await runGates(env.paths, opened.work, env.profile, env.policy, {
        only: only as (GateName | JudgementGateName)[] | undefined,
        tampered: env.tampered || opened.tampered,
      });
      // A gate run is the work entering its gate phase, and its delivery when it proves the work;
      // the guards still decide, so a missing record or document keeps the phase where it is.
      deliver(env, opened, outcome.evidence);
      const raised = outcome.raised
        ? `Route raised to ${outcome.raised}: ${opened.work.routeReasons.at(-1)}\n`
        : "";
      // The summary is the result either way; the exit code says whether the work is proven, so a
      // command chain stops at "Not proven" instead of going on to commit (finding 18).
      const picked = refreshed.changed.length
        ? `profile refreshed: ${refreshed.changed.join("; ")}\n`
        : "";
      const review = outcome.review
        ? relative(env.paths.root, outcome.review).replace(/\\/g, "/")
        : null;
      // The judgement gates still to run, each with why it is planned: the cost is printed before
      // the roles run (SP2 §10). The rows the status and the panel show decide: a current ruling
      // or a counted skip takes a gate off the list, a ruling on earlier code keeps it on.
      const pending = judgementRows(
        opened.work,
        outcome.evidence,
        outcome.judgement,
        outcome.evidence.fingerprint ?? "",
        env.policy,
      ).filter((r) => r.status === "planned" || r.status === "stale");
      const judgementNote = pending.length
        ? `\nJudgement gates to run: ${pending.map((r) => `${r.gate} (${r.planned})`).join(", ")}; inputs in ${review}/ (diff.patch, files.txt); record each with crew judgement ${opened.work.id} record --ruling <file>`
        : "";
      // What the reviewers' patch lacks is said here too, never found out from an empty file
      // (review of SP2b, findings 9 and 10).
      const reviewLine = outcome.reviewNote ? `\ndiff.patch: ${outcome.reviewNote}` : "";
      // The captures the session took, and which of them lack the console file the UI/UX rubric
      // needs (rule 5): said at the gate run, before the reviewer is launched.
      const captures = outcome.review
        ? (readReviewInputs(env.paths, opened.work.id)?.captures ?? [])
        : [];
      const silent = captures.filter((c) => c.console === null).map((c) => basename(c.file));
      const capturesLine = captures.length
        ? `\ncaptures: ${captures.length}${silent.length ? ` (${silent.length} without a console file: ${silent.join(", ")})` : ""}`
        : "";
      return {
        code: outcome.verdict === "proven" ? 0 : 1,
        stdout: true,
        text:
          picked +
          raised +
          gateSummary(opened.work, outcome.verdict, outcome.unproven, outcome.evidence.runs) +
          judgementNote +
          reviewLine +
          capturesLine +
          (outcome.saveRefused ? `\n${outcome.saveRefused}` : ""),
        data: {
          verdict: outcome.verdict,
          unproven: outcome.unproven,
          runs: outcome.evidence.runs,
          raised: outcome.raised,
          route: opened.work.route,
          refreshed: refreshed.changed,
          judgement: outcome.judgement,
          review,
          reviewNote: outcome.reviewNote,
        },
      };
    }
    case "judgement": {
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened)) return opened;
      const usage =
        'usage: crew judgement <id> record --ruling <file> | crew judgement <id> record <gate> --not-run --reason "<why>"';
      if (args[1] !== "record") return refuse(usage);
      // A todo's ruling goes into the todo's gate (SP7b decision 14), never into the item's rounds.
      if (parsed.flags.task !== undefined) {
        if (typeof parsed.flags.task !== "string" || !/^T-\d+$/.test(parsed.flags.task))
          return refuse("usage: crew judgement <id> record --task T-n --ruling <file>");
        return recordTaskJudgement(
          env,
          opened.work,
          env.tampered || opened.tampered,
          parsed,
          parsed.flags.task,
        );
      }
      const before = assess(
        env.paths,
        opened.work,
        env.profile,
        env.policy,
        env.tampered || opened.tampered,
      );
      const planned = before.judgement.map((j) => j.gate);
      // The rounds' cap (SP7 §6.1): a round is the records against one state of the code, so a
      // record on the code the last round vouched for joins it, and a record on new code opens the
      // next. Past the policy's cap plus the rounds the user granted, the command refuses before
      // reading anything, and the user decides.
      const rounds = opened.work.rounds ?? { judgement: 0, validation: 0 };
      const newRound = rounds.judgementCode !== before.currentFingerprint;
      if (newRound) {
        const held = continueOrRefuse(
          env,
          opened.work,
          "judgement",
          undefined,
          env.policy.team.maxJudgementRounds,
          rounds.judgement,
          `judgement round ${rounds.judgement + 1} of ${opened.work.id}: the policy allows ${env.policy.team.maxJudgementRounds} (team.maxJudgementRounds); the user continues it once with crew continue ${opened.work.id} judgement, or decides (crew skip <id> gate:<gate> where policy.json allows it)`,
        );
        if (held) return held;
      }
      // A ruling is about the inputs the judge saw: none, or inputs cut from other code, and the
      // file cannot be recorded against the code as it is now (review of SP2b, finding 1).
      if (!parsed.flags["not-run"]) {
        const inputs = readReviewInputs(env.paths, opened.work.id);
        if (!inputs)
          return refuse(
            `no review inputs for this item: run crew gate run ${opened.work.id} first, then the reviewers and the judge`,
          );
        if (inputs.fingerprint !== before.currentFingerprint)
          return refuse(
            `the review inputs describe other code than the current one: run crew gate run ${opened.work.id}, then the reviewers and the judge again`,
          );
      }
      const input = rulingRecords(
        env,
        parsed,
        args[2],
        planned,
        before.currentFingerprint,
        before.changed,
        opened.work.id,
        "this item",
        usage,
      );
      if (isOutcome(input)) return input;
      const { records } = input;
      fillTokens(
        records,
        before.evidence.roles ?? [],
        readReviewInputs(env.paths, opened.work.id)?.at,
      );
      // The rulings go into the evidence as it stands at the save, under the lock (finding 81), the
      // verdict is computed on it, and the file is written once, with the verdict: no reader sees
      // new records beside a stale verdict (review of SP2b, finding 8). A record that proves the
      // work delivers it; a refused save (the file edited outside the engine, a lock held) records nothing.
      const saved = updateEvidence(env.paths, opened.work.id, (fresh) => {
        for (const record of records) recordJudgement(fresh, record);
        const merged = reassess({ ...before, evidence: fresh }, opened.work, env.policy);
        fresh.verdict = merged.verdict;
        fresh.unproven = merged.unproven;
        return merged;
      });
      if ("refused" in saved) return refuse(saved.refused);
      const result = saved.result;
      // The round spent, counted at the first record against this code (plan decision 3 of SP7a).
      if (newRound)
        opened.work.rounds = {
          ...rounds,
          judgement: rounds.judgement + 1,
          judgementCode: before.currentFingerprint,
        };
      saveWork(env.paths, opened.work);
      // The round's files, kept by the engine before any later gate run resets the folder (finding 70).
      if (typeof parsed.flags.ruling === "string")
        keepRound(
          env.paths,
          opened.work.id,
          opened.work.rounds?.judgement ?? rounds.judgement,
          records.map((r) => r.gate),
          resolve(env.paths.root, parsed.flags.ruling),
        );
      // Each upheld defect inside the change is a decision the judge took about this code (SP7 §6.6).
      const rulingFile =
        typeof parsed.flags.ruling === "string"
          ? relative(env.paths.root, resolve(env.paths.root, parsed.flags.ruling)).replace(
              /\\/g,
              "/",
            )
          : undefined;
      for (const record of records)
        for (const f of record.findings)
          if (record.verdict === "not-proven" && f.severity === "defect" && !f.outside)
            appendDecision(env.paths, {
              at: nowIso(),
              item: opened.work.id,
              kind: "ruling",
              text: `${record.gate} defect: ${f.file}${f.line ? `:${f.line}` : ""} ${f.text}`,
              by: "the judge",
              ...(rulingFile ? { file: rulingFile } : {}),
            });
      deliver(env, opened, result.evidence);
      const lines = records.map((r) => {
        const outside = r.findings.filter((f) => f.outside).length;
        const detail =
          r.verdict === "not-run"
            ? `: ${r.reason}`
            : ` (${findingsText(r.findings.length)}${outside ? `, ${outside} outside the change` : ""})`;
        return `  ${r.gate}: ${verdictWord(r.verdict)}${detail}`;
      });
      lines.push(
        result.verdict === "proven"
          ? `Proven: ${opened.work.id}`
          : `Not proven: ${result.unproven.join("; ")}`,
      );
      // Like gate run: the exit code says whether the work is proven, so a chain stops at "Not proven".
      return {
        code: result.verdict === "proven" ? 0 : 1,
        stdout: true,
        text: lines.join("\n"),
        data: { records, verdict: result.verdict, unproven: result.unproven },
      };
    }
    case "skip": {
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened)) return opened;
      const raw = args[1];
      const reason = typeof parsed.flags.reason === "string" ? parsed.flags.reason.trim() : "";
      if (!raw || !reason) return refuse('usage: crew skip <id> <step> --reason "<text>"');
      const step = skipStep(opened.work, raw);
      if (!step) return refuse(`unknown step: ${raw}`);
      if (!skipAllowed(env.policy, step)) {
        return refuse(
          step.startsWith("gate:")
            ? `the team policy does not allow skipping ${step}: gates are mandatory. Fix what fails, set the gate's command to the team's own flow (crew profile set ${step.slice(5)} "<cmd>"), or have a person list the gate in policy.json allowSkips.`
            : `the team policy does not allow skipping ${step}`,
        );
      }
      if (env.config.mode === "pilot" && (step === "gate:secrets" || step === "gate:deps"))
        return refuse(`in pilot mode the ${step.slice(5)} gate cannot be skipped`);
      const decision = decisionFlag(parsed, env.policy);
      if (isOutcome(decision)) return decision;
      addSkip(opened.work, step, reason, decision);
      saveWork(env.paths, opened.work);
      return ok(
        `skipped ${step} on ${opened.work.id} ${decisionText(env.policy, decision)}: ${reason}`,
        {
          skips: opened.work.skips,
        },
      );
    }
    case "evidence": {
      const opened = openWork(env, args[0]);
      if (isOutcome(opened)) return opened;
      const refused = tamperRefusal(env, opened);
      const result = assess(
        env.paths,
        opened.work,
        env.profile,
        env.policy,
        env.tampered || opened.tampered,
      );
      result.evidence.verdict = result.verdict;
      result.evidence.unproven = result.unproven;
      const report = reportOf(env, opened.work, result.evidence);
      // Tampered state is still shown, but never saved: saving would record it as the engine's own.
      if (refused)
        return refuse(`${refused.text}\n\n${report}`, {
          verdict: result.verdict,
          unproven: result.unproven,
        });
      const saved = updateEvidence(env.paths, opened.work.id, (fresh) => {
        fresh.verdict = result.verdict;
        fresh.unproven = result.unproven;
      });
      if ("refused" in saved) return refuse(saved.refused);
      writeProtectedText(env.paths, join(workDir(env.paths, opened.work.id), "report.md"), report);
      return ok(report, { verdict: result.verdict, unproven: result.unproven });
    }
    case "task": {
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened)) return opened;
      const usage =
        'usage: crew task <id> open T-n --criteria AC-1,AC-2 [--text "<task text>"] | note T-n --criteria AC-k --scope <path>[,<path>] [--text "<todo>"] | list | merge T-n [--force] | gate T-n [--scope <path>[,<path>]] | brief T-n';
      const ctx = env.mail;
      if (args[1] === "open") {
        const task = args[2];
        const criteria =
          typeof parsed.flags.criteria === "string"
            ? parsed.flags.criteria
                .split(",")
                .map((c) => c.trim())
                .filter(Boolean)
            : [];
        if (!task || !criteria.length) return refuse(usage);
        const out = openTask(
          ctx,
          env,
          opened.work,
          task,
          criteria,
          typeof parsed.flags.text === "string" ? parsed.flags.text : undefined,
        );
        if ("refused" in out) return refuse(out.refused);
        // A task whose implementer did not start, or started and was stopped, keeps its record, its
        // worktree and its branch (a crew task drop is the hardening task's): the line says what to do.
        const session =
          "failed" in out.opened
            ? `the implementer ${out.opened.stopped ? "was started and stopped" : "did not start"}: ${out.opened.failed}; the task keeps its record, the worktree ${out.record.worktree} and the branch ${out.record.branch}: open the implementer by hand there (a session opened by hand is watched by no sweep and no merge check), or drop them (git worktree remove ${out.record.worktree}; git branch -D ${out.record.branch})`
            : `implementer started (${out.opened.name}, pid ${out.opened.pid}, ${out.opened.maxTurns} turns, ${minutesText(out.opened.maxMinutes)})`;
        return ok(
          `${task} opened: message ${out.message.id}, worktree ${out.record.worktree}, branch ${out.record.branch}; ${session}${out.notes.length ? `\n${out.notes.join("\n")}` : ""}`,
          { task: out.record, message: out.message, opened: out.opened, notes: out.notes },
        );
      }
      const list = (flag: unknown): string[] =>
        typeof flag === "string"
          ? flag
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : [];
      if (args[1] === "note") {
        // A todo the lead does inline (SP7 §8.1): no worktree, no message; its scope names its files.
        const task = args[2];
        const criteria = list(parsed.flags.criteria);
        const scope = list(parsed.flags.scope);
        if (!task || !criteria.length) return refuse(usage);
        const planText = readText(join(workDir(env.paths, opened.work.id), "plan.md"));
        const out = noteTask(
          opened.work,
          task,
          criteria,
          scope,
          typeof parsed.flags.text === "string" ? parsed.flags.text : taskText(planText, task),
        );
        if ("refused" in out) return refuse(out.refused);
        saveWork(env.paths, opened.work);
        return ok(`${task} noted: inline, ${criteria.join(",")}, scope ${scope.join(",")}`, {
          task: out.record,
        });
      }
      if (args[1] === "gate") {
        // The todo's own gate on the files it touched (SP7 §8.1), bounded by team.maxGateRounds.
        const task = args[2];
        const record = (opened.work.tasks ?? []).find((t) => t.task === task);
        if (!task || !record)
          return refuse(task ? `${task} is not a task of ${opened.work.id}` : usage);
        // What the gate would run on comes first: a todo with nothing in this checkout is refused
        // for that, not for its rounds, which a continuation would not mend.
        const flagScope = parsed.flags.scope === undefined ? undefined : list(parsed.flags.scope);
        const scoped = taskScope(env.paths.root, env.profile, record, flagScope);
        if ("refused" in scoped) return refuse(scoped.refused);
        const round = record.gate?.round ?? 0;
        const held = continueOrRefuse(
          env,
          opened.work,
          "gate",
          task,
          env.policy.team.maxGateRounds,
          round,
          `gate round ${round + 1} of ${task}: the policy allows ${env.policy.team.maxGateRounds} (team.maxGateRounds); the user continues it once with crew continue ${opened.work.id} gate ${task}, or decides`,
        );
        if (held) return held;
        const result = await runTaskGate(
          env.paths,
          opened.work,
          env.profile,
          env.policy,
          scoped.scope,
        );
        const own = flagScope?.length ? taskScope(env.paths.root, env.profile, record) : scoped;
        const planned = planTaskJudgement(env, {
          work: opened.work,
          tampered: env.tampered || opened.tampered,
          record,
          task,
          round: round + 1,
          scope: scoped.scope,
          ownScope: "scope" in own ? own.scope : [],
          result,
        });
        // The state ladder only climbs past gated: a gate re-run after the brief keeps the todo briefed
        // (the brief is rewritten with crew task brief when the lead wants the new runs in it).
        settleTaskState(opened.work, record, env.policy);
        saveWork(env.paths, opened.work);
        const lines = result.runs.map(
          (r) =>
            `  ${r.gate} (${r.target}): ${r.status} in ${(r.durationMs / 1000).toFixed(1)}s${r.reason ? ` (${r.reason})` : ""}`,
        );
        const pending =
          result.status === "pass" ? taskPending(opened.work, record, env.policy) : [];
        if (pending.length)
          lines.push(
            `Judgement gates to run for ${task}: ${pending
              .map((g) => `${g} (${planned.find((p) => p.gate === g)?.reason ?? ""})`)
              .join(
                ", ",
              )}; inputs in .crew/work/${opened.work.id}/review/${task}/ (diff.patch, files.txt); record each with crew judgement ${opened.work.id} record --task ${task} --ruling <file>`,
          );
        const verdict =
          result.status === "pass" && pending.length
            ? `pass, judgement pending (${pending.join(", ")})`
            : result.status;
        return {
          code: result.status === "pass" ? 0 : 1,
          stdout: true,
          text: `${lines.join("\n")}\n${task} gate round ${round + 1}: ${verdict}`,
          data: { task: record, gate: record.gate, pending },
        };
      }
      if (args[1] === "brief") {
        // What the todo changed, proved and left, from the records (SP7 §8.1); the leads read it at delivery.
        const task = args[2];
        const record = (opened.work.tasks ?? []).find((t) => t.task === task);
        if (!task || !record)
          return refuse(task ? `${task} is not a task of ${opened.work.id}` : usage);
        // --print reads the brief as it is, for the mod; it writes nothing and refuses with none.
        if (parsed.flags.print) {
          const brief = record.brief
            ? readText(join(workDir(env.paths, opened.work.id), record.brief))
            : null;
          if (brief === null)
            return refuse(`${task} has no brief yet (crew task <id> brief ${task})`);
          // The CLI ends every text with a newline: the file's own is dropped so the bytes match.
          return ok(brief.endsWith("\n") ? brief.slice(0, -1) : brief, { task, brief });
        }
        if (record.gate?.status !== "pass")
          return refuse(`${task} has no passing gate yet (crew task <id> gate ${task})`);
        if (taskPending(opened.work, record, env.policy).length)
          return refuse(
            `${task} has a judgement gate not proven yet (crew judgement <id> record --task ${task} --ruling <file>)`,
          );
        const text = writeBrief(
          env.paths,
          opened.work,
          record,
          loadEvidence(env.paths, opened.work.id).evidence,
          env.policy,
        );
        saveWork(env.paths, opened.work);
        return ok(text, { task: record, brief: text });
      }
      if (args[1] === "list") {
        // What became of the implementers first, so the listing says what the mailbox knows now
        // (risk review of SP2c task 4, round 13).
        const swept = sweptText(sweepSafely(ctx));
        // The replies that landed, taken into the record; a failure there (a held lock, a refused
        // write) costs the taking, not the listing, and is named in one line.
        const taken = guarded("the replies were not taken", () =>
          takeReplies(ctx, env.paths, opened),
        );
        let rows: ReturnType<typeof listTasks> = [];
        const listedTasks = guarded("the tasks were not listed", () => {
          rows = listTasks(ctx, opened.work);
        });
        const lines = rows.map(({ task: t, status, verdict, implementer }) =>
          t.inline
            ? `  ${t.task} · ${t.criteria.join(",")} · inline · ${t.state ?? "merged"}`
            : `  ${t.task} · ${t.criteria.join(",")} · ${t.branch} · ${t.message} ${status} · ${t.child ?? "no child yet"} · ${verdict}${implementer ? ` · ${implementer}` : ""}${t.mergedAt ? ` · merged ${t.mergeCommit?.slice(0, 7)}` : ""} · ${t.state ?? "open"}`,
        );
        return ok(
          `${[swept, taken, listedTasks].filter(Boolean).join("\n")}${swept || taken || listedTasks ? "\n" : ""}Tasks of ${opened.work.id}:${listedTasks ? " not listed" : lines.length ? `\n${lines.join("\n")}` : " none"}`,
          {
            tasks: rows,
          },
        );
      }
      if (args[1] === "merge") {
        if (!args[2]) return refuse(usage);
        // `--force` merges an unproven child: the user's decision, taken as every user-only command is.
        const forcedBy = parsed.flags.force ? decisionFlag(parsed, env.policy) : undefined;
        if (isOutcome(forcedBy)) return forcedBy;
        const out = mergeTask(ctx, env, opened.work, args[2], forcedBy ? { forcedBy } : {});
        if ("refused" in out) return refuse(out.refused);
        const forced = forcedBy ? ` forced ${decisionText(env.policy, forcedBy)}` : "";
        const kept = out.worktreeKept
          ? `; worktree ${out.record.worktree} kept: ${out.worktreeKept}`
          : "";
        // What the parent's criteria gained from the child, or why nothing (SP2c 8a).
        const credited = out.credited.length
          ? `\ntest-first of ${out.credited.join(", ")} credited to ${args[2]} (child ${out.record.child})`
          : out.uncredited
            ? `\ntest-first not credited: ${out.uncredited}`
            : "";
        return ok(
          `${out.swept.length ? `${out.swept.join("\n")}\n` : ""}merged ${args[2]} of ${opened.work.id}: ${out.commit.slice(0, 7)} (${out.record.branch}, child ${out.record.child}, ${out.record.verdict})${forced}${kept}${credited}`,
          {
            task: out.record,
            commit: out.commit,
            swept: out.swept,
            credited: out.credited,
            uncredited: out.uncredited,
          },
        );
      }
      return refuse(usage);
    }
    case "decisions": {
      // The project's register (SP7 §6.6): what every item decided, newest first; the engine's file.
      const tampered = tamperRefusal(env);
      if (tampered) return tampered;
      const grep = typeof parsed.flags.grep === "string" ? parsed.flags.grep : undefined;
      const entries = listDecisions(env.paths, grep);
      const text = entries.length
        ? entries.map(decisionLine).join("\n")
        : grep
          ? `no entry matches ${grep}`
          : "the register is empty";
      return ok(text, { entries });
    }
    case "team": {
      // The seats the route plans for the item, printed before anything runs and recorded (SP7 §6.2, §6.6).
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened)) return opened;
      const changed = changedWatchedPaths(env.paths.root, env.profile, opened.work);
      const seats = plannedSeats(opened.work.route, opened.work.riskAreas, changed, env.policy);
      const primary = primaryTeam(changed);
      opened.work.seats = seats;
      opened.work.primaryTeam = primary;
      saveWork(env.paths, opened.work);
      const text = seats.length
        ? `Team of ${opened.work.id} (primary ${primary}): ${seats.map((s) => `${s.role} (${s.reason})`).join("; ")}`
        : `Team of ${opened.work.id}: no seat (fast route)`;
      return ok(text, { seats, primaryTeam: primary });
    }
    case "validation": {
      // A lead's verdict on the spec, the plan or the delivery, recorded from its file (SP7 §6.4): the
      // engine parses the verdict, refuses a contradiction, and counts a round per state of the spec.
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened)) return opened;
      const usage =
        "usage: crew validation <id> record --what spec|plan|delivery --by lead-<team> --file <path>";
      const what = parsed.flags.what;
      const by = parsed.flags.by;
      const file = parsed.flags.file;
      if (
        args[1] !== "record" ||
        (what !== "spec" && what !== "plan" && what !== "delivery") ||
        typeof by !== "string" ||
        typeof file !== "string"
      )
        return refuse(usage);
      const work = opened.work;
      if (!(work.seats ?? []).some((s) => s.kind === "lead" && s.role === by))
        return refuse(`${by} is not a seat of ${work.id} (crew team ${work.id} prints the seats)`);
      const path = resolve(env.paths.root, file);
      const text = readText(path);
      if (text === null) return refuse(`no validation file at ${path}`);
      const verdict = parseValidation(text);
      if ("refused" in verdict) return refuse(verdict.refused);
      const dir = workDir(env.paths, work.id);
      const evidence = loadEvidence(env.paths, work.id).evidence;
      const hash = validationHash(
        what,
        readText(join(dir, "spec.md")),
        readText(join(dir, "plan.md")),
        evidence.fingerprint ?? "",
      );
      // A round is the records against one state of the spec; the delivery's and the plan's records
      // carry their own count by hash and spend no round (the gate rounds bound a delivery).
      const same = (work.validations ?? []).filter((v) => v.what === what);
      const last = same[same.length - 1];
      const newRound = !last || last.hash !== hash;
      const rounds = work.rounds ?? { judgement: 0, validation: 0 };
      if (what === "spec" && newRound) {
        const held = continueOrRefuse(
          env,
          work,
          "validation",
          undefined,
          env.policy.team.maxValidationRounds,
          rounds.validation,
          `validation round ${rounds.validation + 1} of ${work.id}: the policy allows ${env.policy.team.maxValidationRounds} (team.maxValidationRounds); the user continues it once with crew continue ${work.id} validation, or decides`,
        );
        if (held) return held;
      }
      const round = newRound
        ? (what === "spec" ? rounds.validation : (last?.round ?? 0)) + 1
        : (last?.round ?? 1);
      work.validations = [
        ...(work.validations ?? []),
        {
          what,
          by,
          verdict: verdict.verdict,
          returns: verdict.returns,
          round,
          file: relative(dir, path).replace(/\\/g, "/"),
          hash,
          at: nowIso(),
        },
      ];
      if (what === "spec" && newRound)
        work.rounds = { ...rounds, validation: rounds.validation + 1 };
      saveWork(env.paths, work);
      // A return is a decision of the lead about the item (SP7 §6.6); a validated verdict is the plan's own record.
      const recorded = work.validations[work.validations.length - 1];
      if (verdict.verdict === "returned" && recorded)
        appendDecision(env.paths, {
          at: recorded.at,
          item: work.id,
          kind: "validation",
          text: `${what} returned by ${by}: ${verdict.returns} return${verdict.returns === 1 ? "" : "s"}`,
          by,
          file: recorded.file,
        });
      const said =
        verdict.verdict === "validated"
          ? `validated (round ${round})`
          : `returned, ${verdict.returns} return${verdict.returns === 1 ? "" : "s"} (round ${round})`;
      return ok(`validation of ${what} by ${by}: ${said}`, {
        validation: work.validations[work.validations.length - 1],
        rounds: work.rounds ?? rounds,
      });
    }
    case "metrics": {
      // The figures of this project, or of every registered project of a workspace (SP7 §6.5), from
      // the records alone; the CTO reads them, never a transcript.
      const ws = typeof parsed.flags.workspace === "string" ? parsed.flags.workspace : null;
      let roots = [env.paths.root];
      if (ws) {
        roots = loadRegistry(env.paths.userDir)
          .projects.filter((p) => p.workspace === ws && !p.worktreeOf)
          .map((p) => p.root);
        if (!roots.length)
          return refuse(
            `no project of workspace ${ws} is registered (crew detect in each project)`,
          );
      }
      const metrics = computeMetrics(roots.map((root) => pathsFor(root, env.paths.userDir)));
      return ok(metricsText(metrics), { ...metrics });
    }
    case "cto": {
      // The CTO's plan filed per workspace (SP7 §6.5); the plan itself is the agent's, read from its file.
      const usage = "usage: crew cto record --workspace <ws> --file <plan.md>";
      const ws = parsed.flags.workspace;
      const file = parsed.flags.file;
      if (args[0] !== "record" || typeof ws !== "string" || typeof file !== "string")
        return refuse(usage);
      // The workspace names a folder under the user's crew directory: the same name rule as the
      // mail's workspace, so nothing reaches outside it (code-quality review, round 1).
      if (!MAIL_NAME.test(ws))
        return refuse(
          `a workspace is a lowercase name of letters, digits, dot, dash and underscore, up to 64 characters, not ${ws}`,
        );
      const path = resolve(env.paths.root, file);
      const text = readText(path);
      if (text === null) return refuse(`no plan file at ${path}`);
      const dir = join(env.paths.userDir, "cto", ws);
      ensureDir(dir);
      const target = join(dir, `${nowIso().slice(0, 10)}-plan.md`);
      writeText(target, text);
      return ok(`CTO plan of ${ws} filed: ${target}`, { path: target });
    }
    case "continue": {
      // One more round past a cap, the user's to grant (SP7 §6.1): recorded as theirs, like a skip.
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened)) return opened;
      const usage =
        "usage: crew continue <id> judgement | crew continue <id> validation | crew continue <id> gate T-n";
      const what = args[1];
      if (what !== "judgement" && what !== "validation" && what !== "gate") return refuse(usage);
      const task = what === "gate" ? args[2] : undefined;
      if (what === "gate" && !/^T-\d+$/.test(task ?? "")) return refuse(usage);
      const decision = decisionFlag(parsed, env.policy);
      if (isOutcome(decision)) return decision;
      opened.work.continued = [
        ...(opened.work.continued ?? []),
        { what, ...(task ? { task } : {}), by: decision, at: nowIso() },
      ];
      saveWork(env.paths, opened.work);
      appendDecision(env.paths, {
        at: nowIso(),
        item: opened.work.id,
        kind: "continue",
        text: `${what} continued for one more round`,
        by: whoDecided(decision),
      });
      const subject =
        what === "gate" ? `gate of ${task} of ${opened.work.id}` : `${what} of ${opened.work.id}`;
      return ok(`${subject} continued for one more round ${decisionText(env.policy, decision)}`, {
        continued: opened.work.continued,
      });
    }
    case "workspace": {
      // The business priorities the user signs once (SP7 §10.2): their state, and the acceptance.
      if (args[0] === "priorities") {
        const workspace = env.mail.self.workspace;
        const noWorkspace = "no workspace in the policy (crew policy set mail.workspace <name>)";
        if (args[1] === "accept") {
          if (!workspace) return refuse(noWorkspace);
          const file =
            typeof parsed.flags.file === "string"
              ? resolve(env.paths.root, parsed.flags.file)
              : undefined;
          const by =
            env.policy.attendedDecisions === "relay"
              ? "the user, relayed by the agent"
              : "the user";
          const signed = acceptPriorities(env.paths.userDir, workspace, { file, by });
          if ("refused" in signed) return refuse(signed.refused);
          const state = prioritiesState(env.paths.userDir, workspace);
          const digest = `sha256:${sha256(state.text ?? "").slice(0, 12)}`;
          appendDecision(env.paths, {
            at: nowIso(),
            item: "workspace",
            kind: "priorities",
            text: `business priorities signed (${signed.path}, ${digest})`,
            by,
          });
          return ok(`business priorities signed (${signed.path}, ${digest})`, {
            workspace,
            ...state,
          });
        }
        if (args[1] !== undefined)
          return refuse("usage: crew workspace priorities [accept [--file <path>]] [--json]");
        if (!workspace) return ok(noWorkspace, { workspace: null, state: null });
        const state = prioritiesState(env.paths.userDir, workspace);
        const line =
          state.state === "signed"
            ? `priorities: signed (${state.signedAt})`
            : state.state === "changed"
              ? "priorities: changed since signing (crew workspace priorities accept)"
              : state.state === "unsigned"
                ? "priorities: unsigned (crew workspace priorities accept)"
                : `priorities: none (write ${state.path}, or crew workspace priorities accept --file <path>)`;
        return ok(line, { workspace, ...state });
      }
      // Every project of the workspace from the records alone (SP7b decision 17): nothing is run.
      if (args[0] !== "status")
        return refuse(
          "usage: crew workspace status [--json] | crew workspace priorities [accept [--file <path>]]",
        );
      const status = workspaceStatus(env.paths, env.policy, io.env);
      if ("none" in status) return ok(status.none, { workspace: null, projects: [] });
      const lines = status.projects.map(
        (p) =>
          `  ${p.name} (${p.root}): ${p.gone ? "gone" : p.live ? "live" : "not live"} · items ${p.items} · unread ${p.unread} · threads ${p.threads} open · priorities ${p.priorities} unconfirmed · environment ${p.environment}`,
      );
      return ok(
        `Workspace ${status.workspace}: ${status.projects.length} project${status.projects.length === 1 ? "" : "s"}\n${lines.join("\n")}`,
        { workspace: status.workspace, projects: status.projects },
      );
    }
    case "env": {
      // The project's environment (SP7 §8.2): started, checked, stopped and read by the engine.
      const verb = args[0];
      if (verb !== "start" && verb !== "health" && verb !== "stop" && verb !== "status")
        return refuse("usage: crew env start | health | stop | status");
      const environment = env.profile.environment;
      if (!environment)
        return verb === "status"
          ? ok(NO_ENVIRONMENT, { state: "none", managed: null, pid: null, since: null })
          : refuse(NO_ENVIRONMENT);
      const missing = (["start", "health"] as const).find((k) => !environment[k].command.trim());
      if (missing)
        return refuse(
          `the environment needs ${missing} (crew profile set environment.${missing} "<cmd>")`,
        );
      if (verb === "start") {
        const out = await startEnvironment(env.paths, environment);
        if ("refused" in out) return refuse(out.refused);
        return ok(
          out.started
            ? `environment up (started by the engine, pid ${out.pid}, log ${out.log})`
            : "environment already up (the user's); nothing started",
          { ...out },
        );
      }
      if (verb === "health") {
        const health = await checkHealth(env.paths, environment);
        if (health.up) return ok("up", { up: true, exit: health.exit });
        return {
          code: 1,
          text: `down (exit ${health.exit})`,
          data: { up: false, exit: health.exit },
          stdout: true,
        };
      }
      if (verb === "stop") {
        const out = await stopEnvironment(env.paths, environment);
        if ("refused" in out) return refuse(out.refused);
        return ok(
          `environment stopped (pid ${out.pid}${out.signalled ? ", group signalled" : "; the group was not signalled: the process is no longer the engine's"})`,
          { ...out },
        );
      }
      const status = await envStatus(env.paths, environment);
      return ok(statusLine(status), { ...status });
    }
    case "status": {
      const active = activeWork(env.paths);
      if (!active?.work) return ok("no active work item", { active: null });
      const result = assess(
        env.paths,
        active.work,
        env.profile,
        env.policy,
        env.tampered || active.tampered,
      );
      const work = active.work;
      // The checkout's branch, the plan's todo and the roles working (SP7 §14): the person's view of
      // who does what now. A branch name is cut at 120 characters; none outside a git repository.
      let branch: string | null = null;
      try {
        const name = gitRun(env.paths.root, "rev-parse", "--abbrev-ref", "HEAD").trim();
        branch = name ? (name.length > 120 ? `${name.slice(0, 119)}…` : name) : null;
      } catch {
        branch = null;
      }
      const todoItems = (work.tasks ?? []).map((t) => ({
        task: t.task,
        criteria: t.criteria,
        state: t.state ?? "open",
        inline: t.inline === true,
      }));
      const todo = {
        done: todoItems.filter((t) => t.state === "briefed").length,
        total: todoItems.length,
        items: todoItems,
      };
      const working = workingRoles(env.paths).map((w) => ({
        agent: w.agent,
        team: w.team,
        since: w.since,
        ...(w.description ? { description: w.description } : {}),
      }));
      const extra = [
        branch ? `  branch ${branch}` : null,
        todo.total
          ? `  todo ${todo.done}/${todo.total} briefed (${todoItems.map((t) => `${t.task} ${t.state}`).join(", ")})`
          : null,
        working.length
          ? `  working: ${working.map((w) => (w.description ? `${w.agent} (${w.description})` : w.agent)).join(", ")}`
          : null,
      ].filter((l): l is string => l !== null);
      if (work.source) extra.unshift(`  source ${sourceLine(work.source)}`);
      const text = `${work.id} "${work.title}"\n  phase ${work.phase}, route ${work.route}, kind ${kindOfItem(work)}, ${triageText(work, true)}${waitingText(work)}\n${extra.length ? `${extra.join("\n")}\n` : ""}${gateSummary(work, result.verdict, result.unproven, result.evidence.runs)}`;
      // The mail synced and a task's reply that landed taken into the lead's record (SP2c §7): a
      // failure in either (a held lock, a folder that cannot be written) is one line under the
      // status, never the status lost.
      const synced = guarded("the mail was not synced", () => syncMail(env.mail, env.paths));
      let inbox = emptyInboxSummary();
      const summarised = guarded("the inbox was not read", () => {
        inbox = inboxSummary(env.mail);
      });
      const taken = guarded("the replies were not taken", () =>
        takeReplies(env.mail, env.paths, active),
      );
      let tasks: ReturnType<typeof listTasks> = [];
      const listed = guarded("the tasks were not listed", () => {
        tasks = listTasks(env.mail, work);
      });
      // The project's threads (SP7b decision 18), read like the inbox: a box that cannot be read
      // costs the threads, not the status, and is named in one line.
      let threads: ReturnType<typeof projectThreads> = [];
      const threaded = guarded("the threads were not read", () => {
        threads = projectThreads(env.mail);
      });
      const notes = [synced, summarised, taken, listed, threaded].filter(Boolean);
      return ok(notes.length ? `${text}\n${notes.join("\n")}` : text, {
        active: work.id,
        title: work.title,
        type: work.type,
        kind: kindOfItem(work),
        kindFrom: work.kindFrom ?? null,
        phase: work.phase,
        route: work.route,
        priority: work.priority ?? "normal",
        source: work.source ?? null,
        triage: work.triage ?? null,
        awaiting: work.awaiting,
        awaitingMessage: work.awaitingMessage ?? null,
        mail: { unread: inbox.unread, answered: inbox.answered, waiting: inbox.waiting },
        // The project's threads and the environment's record (SP7b decision 18): what the mod draws.
        threads,
        environment: environmentState(env.paths),
        tasks,
        // The team of the item (SP7 §14): the seats, the session's team, the rounds spent, the
        // branch, the todo and the roles working.
        branch,
        todo,
        working,
        team: work.seats ?? [],
        primaryTeam: work.primaryTeam ?? null,
        rounds: {
          judgement: work.rounds?.judgement ?? 0,
          validation: work.rounds?.validation ?? 0,
        },
        debate: debateState(work),
        baseCommit: work.baseCommit,
        phases: phasesFor(work),
        verdict: result.verdict,
        unproven: result.unproven,
        // One name per gate, so the strip can draw a planned gate that has not run yet.
        expected: [...new Set(result.expected.map((p) => p.gate))],
        criteria: work.criteria.map((c) => ({
          id: c.id,
          kind: c.kind,
          text: c.text,
          tdd: tddSummary(work, result.evidence, c.id, c.kind, env.policy),
          ...(c.contract ? { contract: c.contract } : {}),
        })),
        runs: result.evidence.runs.map((r) => ({
          gate: r.gate,
          target: r.target,
          ...(r.stack ? { stack: r.stack } : {}),
          status: r.status,
          durationMs: r.durationMs,
          ...(r.reason ? { reason: r.reason } : {}),
        })),
        skips: work.skips.map((s) => ({ step: s.step, reason: s.reason })),
        judgement: judgementRows(
          work,
          result.evidence,
          result.judgement,
          result.currentFingerprint,
          env.policy,
        ),
        decisions: (work.decisions ?? []).map((d) => ({
          id: d.id,
          question: d.question,
          ...(d.answer !== undefined ? { answer: d.answer } : {}),
          ...(d.by ? { by: d.by } : {}),
        })),
        objections: loadLedger(env.paths, work.id).ledger.objections.map((o) => ({
          id: o.id,
          severity: o.severity,
          status: objectionStatus(o, work, result.evidence, env.policy),
          text: o.text,
        })),
      });
    }
    case "mail": {
      const sendUsage =
        'usage: crew mail send --to <project|.> --type question|change-request|notice|blocker [--priority blocker|high|normal|low] [--thread <root>] [--agent <session|T-n|role>] [--item <id>] [--reply-to <mid>] [--subject <text>] "<text>" [--file <path>]';
      const usage = `${sendUsage} | inbox [--all] | read <mid> | thread <mid> | accept <mid> [--priority <p>] [--reason "<why>"] | reply <mid> "<text>" [--branch <b>] [--item <child id>] [--contract <kind>:<path>[:<summary>]]… [--as <role>] [--file <path>] | refuse <mid> --reason "<why>" | status | stop <mid>`;
      const ctx = env.mail;
      const verb = args[0];
      if (verb === "send") {
        const to = parsed.flags.to;
        const type = parsed.flags.type;
        const text = args.slice(1).join(" ");
        if (typeof to !== "string" || !isMailType(type)) return refuse(sendUsage);
        const sendPriority: unknown = parsed.flags.priority;
        if (sendPriority !== undefined && !isMailPriority(sendPriority))
          return refuse(badPriority(sendPriority));
        const item = typeof parsed.flags.item === "string" ? parsed.flags.item : undefined;
        const work = item
          ? (loadWork(env.paths, item).work ?? null)
          : (activeWork(env.paths)?.work ?? null);
        if (item && !work) return refuse(`unknown work item: ${item}`);
        const out = send(
          ctx,
          {
            to,
            type,
            text,
            ...(sendPriority ? { priority: sendPriority } : {}),
            ...(typeof parsed.flags.thread === "string" ? { thread: parsed.flags.thread } : {}),
            ...(typeof parsed.flags.agent === "string" ? { agent: parsed.flags.agent } : {}),
            ...(typeof parsed.flags.subject === "string" ? { subject: parsed.flags.subject } : {}),
            ...(typeof parsed.flags.file === "string" ? { filePath: parsed.flags.file } : {}),
            ...(item ? { item } : {}),
            ...(typeof parsed.flags["reply-to"] === "string"
              ? { replyTo: parsed.flags["reply-to"] }
              : {}),
          },
          work,
        );
        if ("refused" in out)
          return refuse(
            `refused: ${out.refused}${out.message ? "; recorded in the outbox as refused" : ""}`,
            { refused: out.refused, message: out.message },
          );
        const { message, delivery } = out;
        const where = `to ${message.to.project} (workspace ${message.to.workspace})`;
        let next: string;
        if (delivery.kind === "self") next = `to ${message.to.agent ?? "session"} of this project`;
        else if (delivery.kind === "live")
          next = `live session (session ${delivery.entry.sessionId}): ring it if your harness lists it`;
        else if (delivery.kind === "queued") next = `queued; ${delivery.reason}`;
        // No live session: the engine opens one for the message (SP2c §10).
        else next = openForMail(ctx, env.policy, message, delivery);
        const note = work
          ? ""
          : "\nnote: no active work item, so no item keeps a copy of this message";
        return ok(`sent ${message.id} ${where}; ${next}${note}`, {
          message,
          delivery: delivery.kind,
          ...(delivery.kind === "open" ? { mode: delivery.mode } : {}),
        });
      }
      if (verb === "inbox") {
        syncMail(ctx, env.paths);
        const { messages, tampered } = ownInbox(ctx);
        if (tampered) return refuse(tamperedBox(ctx.self.project, "inbox"));
        // What is open, and the requests done (never their replies); --all shows everything (SP7 §9).
        const shown = parsed.flags.all
          ? messages
          : messages.filter((m) => {
              const status = mailStatus(m);
              return status === "done" ? !m.replyTo : status !== "refused" && status !== "expired";
            });
        const summary = inboxSummary(ctx);
        const lines = shown.map(
          (m) =>
            `  ${m.id} · [${decidedPriority(m)}] · ${m.type} · from ${partyLabel(m.from)} · ${m.subject} · ${mailStatus(m)}${m.reason ? `: ${m.reason}` : ""}`,
        );
        return ok(
          `Mail (${ctx.self.workspace ?? "alone"}/${ctx.self.project}, as ${ctx.self.agent}): ${summary.unread} unread, ${summary.answered} answered${lines.length ? `\n${lines.join("\n")}` : ""}`,
          { ...summary, messages: shown },
        );
      }
      if (verb === "read") {
        if (!args[1]) return refuse(usage);
        syncMail(ctx, env.paths);
        const notes: string[] = [];
        const result = markRead(ctx, args[1], notes);
        if ("refused" in result) return refuse(result.refused);
        const body = result.bodyFile ? (readText(result.bodyFile) ?? result.body) : result.body;
        const head = [
          ...notes,
          `id: ${result.id}`,
          `from: ${result.from.project} (${result.from.agent})`,
          `to: ${result.to.project}${result.to.agent ? ` (${result.to.agent})` : ""}`,
          `type: ${result.type}`,
          `subject: ${result.subject}`,
          `status: ${mailStatus(result)}${result.reason ? `: ${result.reason}` : ""}`,
          `at: ${result.at}`,
          priorityLine(result),
          ...evidenceLine(result),
          ...(result.from.item ? [`from item: ${result.from.item}`] : []),
          ...(result.replyTo ? [`reply to: ${result.replyTo}`] : []),
          ...(result.branch ? [`branch: ${result.branch}`] : []),
          ...(result.item
            ? [`item: ${result.item}${result.verdict ? ` (${result.verdict})` : ""}`]
            : []),
        ];
        return ok(`${head.join("\n")}\n\n${body}`, { message: result, body });
      }
      if (verb === "reply") {
        const text = args.slice(2).join(" ");
        if (!args[1]) return refuse(usage);
        const notes: string[] = [];
        const result = replyMail(
          ctx,
          args[1],
          text,
          {
            ...(typeof parsed.flags.file === "string" ? { filePath: parsed.flags.file } : {}),
            ...(typeof parsed.flags.branch === "string" ? { branch: parsed.flags.branch } : {}),
            ...(typeof parsed.flags.item === "string" ? { item: parsed.flags.item } : {}),
            ...(typeof parsed.flags.as === "string" ? { as: parsed.flags.as } : {}),
            ...(parsed.multi.contract?.length ? { contracts: parsed.multi.contract } : {}),
          },
          notes,
        );
        if ("refused" in result) return refuse(result.refused);
        return ok(
          `replied to ${args[1]}: ${result.reply.id} to ${result.reply.to.project}; ${args[1]} ${mailStatus(result.original)}${notes.length ? `\n${notes.join("\n")}` : ""}`,
          { reply: result.reply, original: result.original, notes },
        );
      }
      if (verb === "thread") {
        if (!args[1]) return refuse(usage);
        syncMail(ctx, env.paths);
        const result = threadMessages(ctx, args[1]);
        if ("refused" in result) return refuse(result.refused);
        const lines = result.messages.map(
          (m) =>
            `  ${m.id} · [${decidedPriority(m)}] · ${m.type} · ${partyLabel(m.from)} → ${partyLabel(m.to)} · ${oneLine(m.subject)} · ${mailStatus(m)}`,
        );
        return ok(
          `Thread ${args[1]}: ${result.messages.length} message${result.messages.length === 1 ? "" : "s"}, ${result.parties.length} part${result.parties.length === 1 ? "y" : "ies"} (${result.parties.join(", ")})\n${lines.join("\n")}`,
          { root: args[1], messages: result.messages, parties: result.parties },
        );
      }
      if (verb === "accept") {
        if (!args[1]) return refuse(usage);
        const priority: unknown = parsed.flags.priority;
        if (priority !== undefined && !isMailPriority(priority))
          return refuse(badPriority(priority));
        const reason = typeof parsed.flags.reason === "string" ? parsed.flags.reason : undefined;
        const notes: string[] = [];
        const result = acceptMail(
          ctx,
          args[1],
          {
            ...(priority ? { priority } : {}),
            ...(reason ? { reason } : {}),
            by: ctx.self.agent,
          },
          notes,
        );
        if ("refused" in result) return refuse(result.refused);
        const d = result.message.priorityDecision;
        const level = d
          ? `${d.confirmed}${d.confirmed !== d.proposed ? ` (proposed ${d.proposed})` : ""}${d.reason ? `: ${d.reason}` : ""}`
          : priorityOf(result.message);
        return ok(`${args[1]} accepted at ${level}${notes.length ? `\n${notes.join("\n")}` : ""}`, {
          message: result.message,
          notes,
        });
      }
      if (verb === "refuse") {
        const reason = typeof parsed.flags.reason === "string" ? parsed.flags.reason : "";
        if (!args[1] || !reason.trim()) return refuse(usage);
        const notes: string[] = [];
        const result = refuseMail(ctx, args[1], reason, notes);
        if ("refused" in result) return refuse(result.refused);
        return ok(
          `${args[1]} refused: ${reason.trim()}${notes.length ? `\n${notes.join("\n")}` : ""}`,
          { message: result, notes },
        );
      }
      if (verb === "status") {
        const pruned = pruneRegistry(env.paths.userDir);
        // What became of the sessions this project opened, before they are listed (SP2c §10).
        const swept = sweepSafely(ctx);
        const { messages: sessions, tampered, untrusted } = readOpenSessions(ctx);
        const sessionLine = (m: (typeof sessions)[number]) => {
          const opened = m.opened as OpenedSession;
          return `  ${m.id} → ${m.to.project}: ${opened.mode} session ${opened.name} (pid ${opened.pid ?? "none"}), since ${opened.startedAt}, ${Math.floor(minutesRun(opened))} of ${opened.maxMinutes} minutes used, ${opened.maxTurns} turns allowed`;
        };
        const sweptLine = sweptText(swept);
        // With the outbox changed outside the engine (named once: by the sweep's line above, or here
        // where the sweep said nothing, inside a session opened by mail), what it records is listed
        // all the same, marked, with the commands that stop a session's whole process group (the
        // request, then the kill a member that ignored it needs), its log, and whether its pid is
        // still the session, gone, or another process's by now (the rollback's first step).
        const untrustedLine = (m: (typeof sessions)[number]) => {
          const opened = m.opened as OpenedSession;
          const state = pidState(opened);
          const marked =
            state === "session" ? "" : state === "gone" ? " (gone)" : " (pid now another process)";
          return `${sessionLine(m)}, log ${opened.log}${marked}`;
        };
        const named = tampered && !swept.lines.includes(tampered) ? `${tampered}\n` : "";
        const listed = tampered
          ? `${named}open sessions as the outbox records them (not trusted; stop one with kill -TERM -- -<pid>, then kill -KILL -- -<pid> after a second; read its log): ${untrusted.length ? `\n${untrusted.map(untrustedLine).join("\n")}` : "none"}`
          : `open sessions: ${sessions.length ? `\n${sessions.map(sessionLine).join("\n")}` : "none"}`;
        // The inbox read guarded as `crew status` reads it: the sweep's lines and the outbox's
        // sessions stand whether or not the inbox can be read.
        let summary = emptyInboxSummary();
        const summarised = guarded("the inbox was not read", () => {
          summary = inboxSummary(ctx);
        });
        return ok(
          `${summarised || (summary.line ?? `Mail (${ctx.self.workspace ?? "alone"}): inbox empty`)}${sweptLine ? `\n${sweptLine}` : ""}\n${listed}${pruned.length ? `\nregistry pruned: ${pruned.join(", ")}` : ""}`,
          { sessions, untrusted, swept, pruned, ...summary },
        );
      }
      if (verb === "stop") {
        if (!args[1]) return refuse(usage);
        const notes: string[] = [];
        const stopped = stopSession(ctx, args[1], notes);
        if ("refused" in stopped) return refuse(stopped.refused);
        return ok(
          `${stopped.id} stopped (session ${stopped.opened?.name}, pid ${stopped.opened?.pid})${notes.length ? `\n${notes.join("\n")}` : ""}`,
          { message: stopped, notes },
        );
      }
      return refuse(usage);
    }
    default:
      return refuse(`unknown command: ${command}\n${HELP}`);
  }
}

/** The line `crew mail read` prints for a message's priority: the decision when one stands, the proposal otherwise. */
function priorityLine(m: Message): string {
  const d = m.priorityDecision;
  const level = decidedPriority(m);
  if (!d || !isMailPriority(d.confirmed)) return `priority: ${level} (proposed)`;
  const how = d.confirmed === d.proposed ? `confirmed by ${d.by}` : `lowered by ${d.by}`;
  return `priority: ${level} (proposed ${d.proposed}, ${how}${d.reason ? `: ${d.reason}` : ""})`;
}

/** The line `crew mail read` prints for the evidence a reply carried, through the validating reader; none when the record carries none. */
function evidenceLine(m: Message): string[] {
  const ev = readEvidence(m);
  if (!ev) return [];
  return [
    `evidence: gates passed ${ev.gatesPassed.join(", ") || "none"}; fingerprint ${ev.fingerprint ? oneLine(ev.fingerprint) : "none"}; report ${ev.report ?? "none"}`,
  ];
}

/** The line `crew env status` prints: down, or up and who started it. */
function statusLine(status: EnvStatus): string {
  if (status.state === "down") return "environment: down";
  if (status.managed === true)
    return `environment: up, started by the engine (pid ${status.pid}, since ${status.since})`;
  return status.managed === false ? "environment: up (the user's)" : "environment: up";
}

const ENVIRONMENT_KEYS = ["start", "health", "stop", "logs", "url", "timeout"] as const;
type EnvironmentKey = (typeof ENVIRONMENT_KEYS)[number];
const NO_ENVIRONMENT = 'no environment in the profile (crew profile set environment.start "<cmd>")';

/** The user's settings live in their home folder, so these work in any folder. */
function settings(command: "mode" | "config", args: string[], user: { userDir: string }): Outcome {
  const config = loadConfig(user);
  if (command === "mode") {
    if (!args[0]) return ok(config.mode, { mode: config.mode });
    try {
      saveConfig(user, setConfigValue(config, "mode", args[0]));
    } catch (error) {
      return refuse((error as Error).message);
    }
    return ok(`mode: ${args[0]}`, { mode: args[0] });
  }
  const [key, value] = args;
  if (!key) return ok(JSON.stringify(config), { config });
  if (value === undefined) {
    const current =
      key === "mode" ? config.mode : key === "decisions.log" ? config.decisions.log : undefined;
    return current === undefined
      ? refuse(`unknown setting: ${key}`)
      : ok(String(current), { key, value: current });
  }
  try {
    saveConfig(user, setConfigValue(config, key, value));
  } catch (error) {
    return refuse((error as Error).message);
  }
  return ok(`${key}: ${value}`, {
    key,
    value: key === "decisions.log" ? value === "true" : value,
  });
}

const STACKS: readonly Stack[] = ["node", "php", "python", "other"];

const HELP = `crew ${VERSION}
  detect [--refresh]                    build or refresh the project profile
  profile set <gate> "<cmd>" [--target p] [--stack s] [--timeout m]  set a gate command, confirmed in one step (asks the user); m minutes
  profile set <gate> "<cmd>" --force    replace a command a person already confirmed (asks the user)
  profile confirm [<gate>]              confirm commands the detector only guessed (asks the user)
  profile set environment.<start|health|stop|logs|url|timeout> "<value>"   the project's environment, key by key (asks the user)
  profile confirm environment           confirm the environment the detector proposed (asks the user)
  env start | health | stop | status    start the environment (detached, recorded, health awaited), check it, stop what the engine started, say where it stands
  policy accept                         trust the current policy.json after a hand edit (asks the user)
  policy set <key> <value>              attendedDecisions prompt|relay, unattendedDecisions wait|count|validator, mail.workspace|name|open|maxConcurrent|maxHops|maxTurns|maxMinutes|maxParties|worktrees (asks the user)
  accept <id|profile|policy>            trust state changed outside the engine (asks the user)
  start "<request>" --answers <json>    create a work item from the typed answers
      [--criterion "<text>"] [--preserve "<text>"]   criteria, repeatable; preserve: existing tests stay green
      [--origin <message id>]           the item answers a message of this project's inbox (a session opened by mail)
      [--priority blocker|high|normal|low]   the item's priority; else its origin's confirmed one, else normal
  classify <id> --answers <json>        record typed answers and compute the route
  criteria <id> add "<text>" [--kind preserve|observed] [--contract <mid>:<n>]   a criterion, bound to a contract of a reply in the item's mail when given
  criteria <id> remove <AC-n>           take out a criterion no test-first record or skip names
  decision <id> add "<question>" [--default "<answer>"]   a decision only the user can make (gap round)
  decide <id> D-n "<answer>"            record the user's answer (asks the user)
      --mode <mode> --validator stated-default   no person watching: the validator takes the default
  objection <id> add "<text>" --by <role> --severity blocking|advisory   file an objection (ledger)
  objection <id> resolve O-n --criterion AC-k   resolved when that criterion is proven
  objection <id> waive O-n --reason "<why>"     the user decides against it (asks the user)
  debate <id> open --reason "<why>"     the conclave's debate opens on a decision with consequences (once per item)
  debate <id> close [--tokens n]        the judge has ruled; plan is held while the debate is open
  approve <id> spec                     record the user's approval (asks the user)
      --mode auto|bypassPermissions|dontAsk   no person watching: recorded as the agent's decision
  phase <id> next                       advance when the guard holds
  await <id> user | role | mail <mid>   mark the turn's wait: for the user, for the roles, or for a reply to a message
  resume <id>                           clear the wait
  mail send --to <project|.> --type question|change-request|notice|blocker "<text>"   send mail inside the workspace
      [--priority blocker|high|normal|low] [--thread <root>] [--agent <session|T-n|role>] [--item <id>] [--reply-to <mid>] [--subject <text>] [--file <path>]
  mail inbox [--all] | read <mid> | thread <mid> | reply <mid> "<text>" [--branch <b>] [--item <child>] [--contract <kind>:<path>[:<summary>]]… [--as <role>] [--file <path>]
  mail accept <mid> [--priority <p>] [--reason "<why>"]   confirm a request's priority, or lower it with a reason (never raise)
  mail refuse <mid> --reason "<why>" | status | stop <mid>   this project's mail and the sessions it opened (status sweeps them; stop kills one)
  workspace status [--json]           every project of the workspace: live, open items, unread, open threads, unconfirmed priorities, environment (reads records, runs nothing)
  task <id> open T-n --criteria AC-1,AC-2 [--text "<task text>"]   hand a task of the plan to an implementer: a message, a worktree, a branch, a session
  task <id> list | merge T-n [--force]   the tasks and their children; merge a proven child's branch (--force merges an unproven one: asks the user)
  tdd <red|green|before|after|observed> <id> <criterion> [--reason "<why>"] [-- <cmd>]
  gate run <id> [--only a,b]            run the gates the route requires; plans the judgement gates and writes their inputs to .crew/work/<id>/review/
  judgement <id> record --ruling <file>  record the rulings of a review file ({"rulings":[{gate,verdict,reviewer,judge,findings,tokens}]}); exit 0 once proven
  judgement <id> record <gate> --not-run --reason "<why>"   a judgement gate that could not run, never passed by default
  team <id>                   the seats the route plans for the item, with their reasons, recorded
  validation <id> record --what spec|plan|delivery --by lead-<team> --file <path>   a lead's verdict from its file; a contradiction is refused
  continue <id> judgement|validation|gate T-n   one more round past the policy's cap (the user's decision)
  decisions [--grep <text>]   the project's decision register, newest first; the engine appends at every decision
  metrics [--workspace <ws>]  the figures of this project, or of the workspace's registered projects, from the records
  cto record --workspace <ws> --file <plan.md>   file the CTO's plan under the user's crew directory
  skip <id> <step> --reason "<text>"    record a skip of a tdd step, a gate or a judgement gate (asks the user; --mode as for approve)
  evidence <id>                         write and print the report
  status | mode [m] | config <key> [v]  state and settings
  --json on any command prints the machine form`;

export async function main(argv: string[], io: CliIo): Promise<number> {
  const parsed = parse(argv);
  let outcome: Outcome;
  try {
    // The PreToolUse hook recognises user-only verbs by `crew <verb>`; a flag ahead of the command
    // (or ahead of the verb of profile/policy) would run them without the hook asking.
    const first = argv[0] ?? "";
    const leadingFlag =
      (first.startsWith("--") && first !== "--version") ||
      ((first === "profile" || first === "policy") && (argv[1] ?? "").startsWith("--"));
    outcome = leadingFlag
      ? refuse("the command comes first: crew <command> [arguments] [--flags]")
      : await dispatch(parsed, io);
  } catch (error) {
    if (parsed.positional[0] === "hook") {
      io.stdout("{}\n");
      return 0;
    }
    io.stderr(`crew: ${(error as Error).message}\n`);
    return 2;
  }
  if (parsed.positional[0] === "hook") {
    io.stdout(`${outcome.text}\n`);
    return 0;
  }
  if (parsed.flags.json)
    io.stdout(
      `${JSON.stringify({ ok: outcome.code === 0, message: outcome.text, ...outcome.data })}\n`,
    );
  else if (outcome.code === 0 || outcome.stdout) io.stdout(`${outcome.text}\n`);
  else io.stderr(`${outcome.text}\n`);
  return outcome.code;
}
