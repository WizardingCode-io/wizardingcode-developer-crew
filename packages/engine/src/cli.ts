import { existsSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { analyseOrigin, originSummary, readOrigin, writeOrigin } from "./analysis.ts";
import { commaList, type Parsed, parse } from "./argv.ts";
import { assembleAuditReport, renderAuditHtml, renderAuditMarkdown } from "./audit-report.ts";
import {
  type AuditRuns,
  type AuditScope,
  auditRunLine,
  auditSummary,
  cappedRefusal,
  runAudit,
  staleRefusal,
} from "./audit-run.ts";
import { auditState, type ReportRecord, type ReportSignature, reportHash } from "./audit-state.ts";
import { brandOf } from "./brand.ts";
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
  type DecisionEntry,
  decisionLine,
  decisionsCount,
  listDecisions,
  registerTampered,
} from "./decisions.ts";
import {
  ENVIRONMENT_COMMANDS,
  ENVIRONMENT_TIMEOUT_MS,
  type EnvironmentCommand,
} from "./detect/environment.ts";
import { detectProfile, missingTestCommands } from "./detect/index.ts";
import {
  checkHealth,
  type EnvStatus,
  envStatus,
  startEnvironment,
  stopEnvironment,
} from "./environment.ts";
import {
  type AuditReportView,
  countedNote,
  decidedBy,
  learnedText,
  loadEvidence,
  renderReport,
  tddSummary,
  updateEvidence,
  whoDecides,
} from "./evidence.ts";
import { changedPaths, changedWatchedPaths, hashPaths, isGitRepo } from "./fingerprint.ts";
import {
  createFreeFile,
  createFreeFiles,
  ensureDir,
  jsonText,
  nowIso,
  readJson,
  readText,
  readTextQuietly,
  sha256,
  writeJson,
  writeText,
} from "./fs.ts";
import { assess, reassess, runGates, runTaskGate } from "./gates.ts";
import { buildContext } from "./hooks/context.ts";
import { handleHook } from "./hooks/index.ts";
import { leaveNotice } from "./hooks/notices.ts";
import { fileAnswerBySession } from "./hooks/subagent-stop.ts";
import type { HookPayload } from "./hooks/types.ts";
import { JEV_ENDPOINT, JEV_MODEL, jevConfig, two } from "./jev.ts";
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
  reviewDir,
  scopeHash,
  stampRuling,
  verdictWord,
  writeReviewInputs,
} from "./judgement.ts";
import {
  addEntry,
  ctoInputsFile,
  defaultConfidential,
  entryLine,
  entryText,
  fileInsideRoot,
  HARNESS_LESSON,
  harnessLesson,
  KNOWLEDGE_KINDS,
  knowledgeText,
  knownRootCauses,
  latestPlan,
  lessonsForCto,
  lookup,
  PLAN_INPUTS_EXT,
  planInputsPath,
  readBase,
  rerankHits,
  scopeOf,
  USER_KINDS,
  updateEntry,
  visibleTo,
  words,
} from "./knowledge.ts";
import { learnItem } from "./learn.ts";
import {
  acceptBox,
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
} from "./mail.ts";
import { computeMetrics, knowledgeFigures, metricsText } from "./metrics.ts";
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
  discoverPacks,
  knowledgeFilesFor,
  listPacks,
  type PackListing,
  packFiles,
  packLabel,
  packRules,
  packTemplates,
  recordPacks,
  recordPackUse,
  registerPack,
  removePack,
  stateText,
} from "./packs.ts";
import {
  type CrewPaths,
  ctoDir,
  PROTECTED_WORK_FILES,
  pathsFor,
  resolvePaths,
  userDirOf,
  workDir,
} from "./paths.ts";
import { printPdf } from "./pdf.ts";
import {
  decisionCounts,
  LIST_POLICY_KEYS,
  loadPolicy,
  MAIL_NAME,
  NAME_HINT,
  POLICY_CHANGE_RULE,
  planListChange,
  SETTABLE_POLICY_KEYS,
  setPolicyValue,
  skipAllowed,
  unattendedPolicyChange,
  writeListChange,
} from "./policy.ts";
import {
  acceptPriorities,
  prioritiesLine,
  prioritiesState,
  triagePriority,
  triageText,
} from "./priorities.ts";
import { ensureProfile, loadProfile, refreshProfile, saveProfile } from "./profile.ts";
import {
  addQuestion,
  answerQuestion,
  channelList,
  channelsText,
  isQuestionChannelKind,
  markPosted,
  openQuestions,
  postDocumentQuestion,
  questionChannels,
  questionJson,
  questionLine,
  questionsSorted,
} from "./questions.ts";
import { fetchSource, findQuote, parseFacts } from "./research.ts";
import { withRunning } from "./running.ts";
import {
  checkRuntime,
  ENGINE_EVENTS,
  type EngineEvent,
  installRuntime,
  listLines,
  pluginRoot,
  RUNTIME_NAMES,
  removeRuntime,
  runtimeOf,
  type Scope,
} from "./runtimes.ts";
import { scanText } from "./secrets.ts";
import { parseSource, sourceLine } from "./source.ts";
import {
  adoptMainFiles,
  ensureCrewDir,
  loadState,
  oneLine,
  saveState,
  updateState,
  workingRoles,
} from "./state.ts";
import {
  integrityOf,
  readProtectedJson,
  recordIntegrity,
  rel,
  writeProtectedJson,
  writeProtectedText,
} from "./store.ts";
import {
  checkStrategy,
  parseStrategy,
  RESEARCH_AND_BASE,
  RESEARCHER_FIRST,
  STRATEGY_SECTIONS,
  type StrategyReport,
  strategyHash,
  strategyReport,
  verdictText,
} from "./strategy.ts";
import {
  dropTask,
  findTask,
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
import { auditSeats, plannedSeats, primaryTeam, ROLE_NAMES, teamsFor } from "./team.ts";
import type {
  Criterion,
  Decision,
  Environment,
  Evidence,
  FindingVerification,
  GateCommand,
  GateName,
  JudgementGateName,
  JudgementRecord,
  KnowledgeEntry,
  KnowledgeKind,
  MailPriority,
  Message,
  OpenedSession,
  Phase,
  PlannedJudgement,
  PlannedStrategyJudgement,
  Policy,
  Profile,
  ProjectEntry,
  RoleRecord,
  Stack,
  TaskRecord,
  Triage,
  UserConfig,
  Verification,
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
  type QuestionRecord,
  VALIDATOR_RULES,
} from "./types.ts";
import {
  fileHash,
  leadHeading,
  parseValidation,
  replyFile,
  validationHash,
  validationRound,
} from "./validation.ts";
import {
  applyDefectMarks,
  askAllowed,
  type DefectsOutcome,
  type FactInput,
  type TriageOutcome,
  verifyDefects,
  verifyFacts,
  verifyTriage,
  verifyValidator,
} from "./verify.ts";
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
  noteRuntime,
  openDebate,
  openItems,
  parseParts,
  phasesFor,
  plannedStrategyJudgement,
  raiseKind,
  removeCriterion,
  saveWork,
  supersedeCriterion,
  validatorPreconditions,
  waitingPhrase,
  waitingText,
} from "./work.ts";
import { environmentState, projectThreads, workspaceStatus } from "./workspace.ts";
import { gitRun, worktreeMainRoot } from "./worktree.ts";

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
  profile: ["target", "stack", "force", "timeout", "mode"],
  policy: ["remove", "mode", "validator"],
  accept: [],
  start: [
    "answers",
    "criterion",
    "preserve",
    "observed",
    "part",
    "origin",
    "priority",
    "source",
    "reason",
  ],
  classify: ["answers"],
  kind: ["reason"],
  strategy: [],
  audit: ["only"],
  criteria: ["kind", "contract", "by"],
  decision: ["default"],
  debate: ["reason", "tokens"],
  decide: ["mode", "validator"],
  objection: ["by", "severity", "criterion", "reason", "mode"],
  approve: ["mode", "validator"],
  phase: [],
  await: [],
  // A resume that clears a jev dispute is a decision (finding 94): --mode where nobody watches.
  resume: ["mode"],
  tdd: ["reason"],
  gate: ["only"],
  judgement: ["ruling", "not-run", "reason", "task"],
  skip: ["reason", "mode"],
  evidence: [],
  status: [],
  env: [],
  task: ["criteria", "text", "scope", "part", "force", "mode", "print"],
  workspace: ["file"],
  question: ["channel", "ref", "mode"],
  analyse: ["paths"],
  research: ["file"],
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
      ? '; for a criterion that existing tests keep green use --preserve "<text>", for one no test can fail first --observed "<text>"'
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
  /** The Claude Code session running this command, when one does: the owner of a run's marker (finding 146). */
  session: string | null;
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
    session: processEnv.CLAUDE_CODE_SESSION_ID ?? null,
  };
}

/**
 * The lane's end (session lanes, AC-6): an item learned in a worktree tells its own project by mail
 * that its branch is proven, and the output's last line names the merge. A mail that fails is a
 * note, never a failed learn; in a main checkout, nothing.
 */
function laneEnd(env: Env, work: WorkItem): string[] {
  const main = worktreeMainRoot(env.paths.root);
  if (!main) return [];
  let branch: string;
  try {
    branch = gitRun(env.paths.root, "rev-parse", "--abbrev-ref", "HEAD");
  } catch {
    return [];
  }
  const text = `Lane ${branch} (${work.id}, proven) is proven: commit it, then merge it from the main checkout.`;
  let note: string | null = null;
  try {
    const sent = send(env.mail, { to: ".", type: "notice", text, item: work.id }, work);
    if ("refused" in sent) note = `lane notice not sent: ${sent.refused}`;
  } catch (error) {
    note = `lane notice not sent: ${(error as Error).message}`;
  }
  return [...(note ? [note] : []), `merge ${branch} from ${main} when its work is committed`];
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

/** What `crew accept` takes: an item, a file of .crew/, or this project's own mailbox. */
const ACCEPT_USAGE =
  "usage: crew accept <id|profile|policy|decisions> | crew accept mail inbox|outbox";

/**
 * The user trusts this project's own mailbox again after a hand edit (finding 30): the box's file
 * and each message it now holds are printed, so the signature is informed, and the acceptance is a
 * decision of the register. Asks the user (PreToolUse), as every accept does.
 */
function acceptMailbox(env: Env, parsed: Parsed, which: "inbox" | "outbox"): Outcome {
  // Who signs, as crew abandon reads it (triage 4k): under relay, the user relayed by the agent.
  const decision = decisionFlag(parsed, env.policy);
  if (isOutcome(decision)) return decision;
  const accepted = acceptBox(env.mail, which);
  if ("refused" in accepted) return refuse(accepted.refused);
  const { file, messages } = accepted;
  const counted = `${messages.length} message${messages.length === 1 ? "" : "s"}`;
  decide(env, "mail", {
    kind: "accept",
    text: `${which} accepted as it is after a hand edit: ${file} (${counted})`,
    by: whoDecides(decision),
  });
  const lines = messages.map((m) => `  ${m.id} · from ${m.from.project} · ${mailStatus(m)}`);
  return ok(
    [`${which} accepted: ${file} is now trusted as it is, ${counted}`, ...lines].join("\n"),
    { accepted: `mail ${which}`, file, messages },
  );
}

/** The item opened and not hand-edited: the prologue every command that may write shares. */
function openUntampered(env: Env, id: string | undefined): Opened | Outcome {
  const opened = openWork(env, id);
  if (isOutcome(opened)) return opened;
  return tamperRefusal(env, opened) ?? opened;
}

/** Opens a work item for a command that saves it; refuses when its state cannot be trusted. */
function openForChange(env: Env, id: string | undefined): Opened | Outcome {
  const opened = openUntampered(env, id);
  if (isOutcome(opened)) return opened;
  // An abandoned item is read, never changed again (finding 124): one door for every command.
  if (opened.work.abandoned)
    return refuse(`${abandonedLine(opened.work.id, opened.work.abandoned)}; start a new item`);
  return opened;
}

/** `<id> was abandoned on <date>: <reason>`, the refusal every command gives an item the user dropped. */
function abandonedLine(id: string, closed: NonNullable<WorkItem["abandoned"]>): string {
  return `${id} was abandoned on ${closed.at.slice(0, 10)}: ${closed.reason}`;
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

/** The judgement gates of the rubrics a session may seat beyond the route's (finding 140). */
const SEATABLE_GATES: readonly JudgementGateName[] = JUDGEMENT_GATES.filter(
  (g) => g !== "strategy",
);

const SEAT_USAGE = 'usage: crew team <id> seat <gate> --reason "<why>"';

/**
 * `crew team <id> seat <gate> --reason`: a judgement gate the route did not plan, added to the
 * item's with its reason and time, and on the register as the agent's: it strengthens the item, so
 * it is no decision of the user's (finding 140). The gate run lists it and the ruling accepts it.
 */
function seatJudgement(env: Env, parsed: Parsed, opened: Opened, words: string[]): Outcome {
  const [gate] = words;
  if (!gate || words.length > 1) return refuse(SEAT_USAGE);
  if (!(SEATABLE_GATES as readonly string[]).includes(gate))
    return refuse(`unknown judgement gate: ${gate} (${SEATABLE_GATES.join(", ")})`);
  const work = opened.work;
  const planned = assess(env.paths, work, env.profile, env.policy, opened.tampered).judgement;
  const already = planned.find((p) => p.gate === gate);
  if (already) return refuse(`${gate} is already planned for ${work.id} (${already.reason})`);
  const reason = typeof parsed.flags.reason === "string" ? parsed.flags.reason.trim() : "";
  if (!reason) return refuse(SEAT_USAGE);
  const at = nowIso();
  work.seatedJudgement = [
    ...(work.seatedJudgement ?? []),
    { gate: gate as JudgementGateName, reason, at },
  ];
  saveWork(env.paths, work);
  decide(env, work.id, {
    at,
    kind: "decision",
    text: `judgement gate ${gate} seated: ${reason}`,
    by: "the agent",
  });
  return ok(`${gate} seated on ${work.id}: ${reason}; the gate run plans it`, {
    seated: work.seatedJudgement,
  });
}

/** The decision as the report will show it: who, and whether the policy counts it. */
function decisionText(policy: Policy, decision: Decision): string {
  const note = countedNote(policy, decision);
  return `${decidedBy(decision)}${note ? ` (${note.slice(2)})` : ""}`;
}

/** The register's entries of a ruling (SP7 §6.6), as `decide` takes them: each upheld defect inside the change, a decision the judge took about this code. */
function rulingDecisions(
  records: readonly JudgementRecord[],
  file: string | undefined,
): Omit<DecisionEntry, "at" | "item">[] {
  return records.flatMap((record) =>
    record.verdict === "not-proven"
      ? record.findings
          .filter((f) => f.severity === "defect" && !f.outside)
          .map((f) => ({
            kind: "ruling" as const,
            text: `${record.gate} defect: ${f.file}${f.line ? `:${f.line}` : ""} ${f.text}`,
            by: "the judge",
            ...(file ? { file } : {}),
          }))
      : [],
  );
}

/** One entry of the project's register for an item (or a name such as `policy`), stamped now unless the record carries its own time. */
function decide(
  env: Env,
  item: string,
  fields: Omit<DecisionEntry, "at" | "item"> & { at?: string },
): void {
  appendDecision(env.paths, { at: fields.at ?? nowIso(), item, ...fields });
}

/**
 * A todo's own gate on the files it touched (SP7 §8.1), bounded by team.maxGateRounds: the gates
 * its scope runs, the judgement it plans, the state it climbs to.
 */
async function taskGate(
  env: Env,
  opened: Opened,
  parsed: Parsed,
  record: TaskRecord,
): Promise<Outcome> {
  const task = record.task;
  // What the gate would run on comes first: a todo with nothing in this checkout is refused
  // for that, not for its rounds, which a continuation would not mend.
  const flagScope = parsed.flags.scope === undefined ? undefined : commaList(parsed.flags.scope);
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
  const result = await runTaskGate(env.paths, opened.work, env.profile, env.policy, scoped.scope);
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
  const pending = result.status === "pass" ? taskPending(opened.work, record, env.policy) : [];
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
  decide(env, work.id, {
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

/** The gates a judgement command names, read before anything is checked: the --not-run gate word, or every gate of the ruling file (none when the file cannot be read or parsed: the normal path says why). */
function rulingGates(env: Env, parsed: Parsed, gateWord: string | undefined): string[] {
  if (parsed.flags["not-run"]) return gateWord ? [gateWord] : [];
  if (typeof parsed.flags.ruling !== "string") return [];
  const text = readText(resolve(env.paths.root, parsed.flags.ruling));
  if (text === null) return [];
  try {
    const raw = JSON.parse(text) as { rulings?: { gate?: unknown }[] };
    return Array.isArray(raw.rulings)
      ? raw.rulings.map((r) => (typeof r?.gate === "string" ? r.gate : ""))
      : [];
  } catch {
    return [];
  }
}

/**
 * A strategy ruling (SP7 §7.3, SP8 Task 3): on a new project alone, after the check, against the
 * hash of strategy.md and conclave/researcher.md as they are now (an edit after the check refuses
 * the record; an edit after the record makes it stale), with strategy.md inside the change; on
 * the full route the CTO's review (written after the check) names the reviewer, on standard the
 * judge; a record on a new hash opens a strategy round under the judgement cap.
 */
async function recordStrategyJudgement(
  env: Env,
  opened: Opened,
  parsed: Parsed,
  gateWord: string | undefined,
  usage: string,
): Promise<Outcome> {
  const work = opened.work;
  const [planned] = plannedStrategyJudgement(work);
  if (!planned)
    return refuse(
      "strategy is not a phase of this item: a strategy ruling is recorded on a new project alone",
    );
  const dir = workDir(env.paths, work.id);
  const inputs = readJson<{ at?: string; hash?: string }>(
    join(dir, "review", "strategy", "inputs.json"),
  );
  if (!inputs || typeof inputs.hash !== "string" || typeof inputs.at !== "string")
    return refuse(
      `no strategy check for this item: run crew strategy ${work.id} check first, then the reviewer and the judge`,
    );
  const research = readText(join(dir, "conclave", "researcher.md"));
  const text = readText(join(dir, "strategy.md"));
  if (research === null) return refuse(RESEARCHER_FIRST);
  if (text === null) return refuse("strategy.md in the work folder (references/strategy.md)");
  const hash = strategyHash(text, research);
  if (hash !== inputs.hash)
    return refuse(
      `strategy.md or conclave/researcher.md changed after the check: run crew strategy ${work.id} check again, then the reviewer and the judge`,
    );
  const input = rulingRecords(
    env,
    parsed,
    gateWord,
    ["strategy"],
    hash,
    ["strategy.md", `.crew/work/${work.id}/strategy.md`],
    work.id,
    "the strategy",
    usage,
  );
  if (isOutcome(input)) return input;
  const record = input.records[0];
  if (!record) return refuse(usage);
  if (record.verdict !== "not-run") {
    if (planned.reviewer === "cto") {
      const cto = join(dir, "conclave", "cto.md");
      if (!existsSync(cto))
        return refuse(
          "the CTO's review of the strategy comes before the ruling on the full route (conclave/cto.md, launched after crew strategy check)",
        );
      if (statSync(cto).mtimeMs < Date.parse(inputs.at))
        return refuse(
          "conclave/cto.md predates the check: the CTO reviews the strategy as it is now, then the judge rules",
        );
      if (record.reviewer !== "cto")
        return refuse(
          "on the full route the CTO reviews the strategy: the ruling names reviewer cto",
        );
    } else if (record.reviewer !== "judge")
      return refuse(
        "on the standard route the judge rules the strategy from the files: the ruling names reviewer judge",
      );
  }
  const rounds = work.rounds ?? { judgement: 0, validation: 0 };
  const round = rounds.strategy ?? 0;
  const newRound = rounds.strategyHash !== hash;
  if (newRound) {
    const held = continueOrRefuse(
      env,
      work,
      "judgement",
      undefined,
      env.policy.team.maxJudgementRounds,
      round,
      `strategy round ${round + 1} of ${work.id}: the policy allows ${env.policy.team.maxJudgementRounds} (team.maxJudgementRounds); the user continues it once with crew continue ${work.id} judgement, or decides`,
    );
    if (held) return held;
  }
  const saved = updateEvidence(env.paths, work.id, (fresh) => {
    recordJudgement(fresh, record);
  });
  if ("refused" in saved) return refuse(saved.refused);
  work.rounds = {
    ...rounds,
    strategy: newRound ? round + 1 : round,
    strategyHash: hash,
  };
  saveWork(env.paths, work);
  const n = record.findings.length;
  return ok(
    `strategy: ${verdictText(record.verdict)} (${n} finding${n === 1 ? "" : "s"}, reviewer ${record.reviewer ?? "judge"}); strategy round ${work.rounds.strategy}`,
    { record, rounds: work.rounds },
  );
}

/**
 * A todo's ruling (SP7b decision 14): parsed against the gates the todo's gate planned, bound to the
 * current code and to the files its inputs were cut for, recorded into the todo's gate and never
 * into the item's evidence or its rounds; the todo is gated once nothing is pending.
 */
async function recordTaskJudgement(
  env: Env,
  ioEnv: NodeJS.ProcessEnv,
  work: WorkItem,
  tampered: boolean,
  parsed: Parsed,
  task: string,
): Promise<Outcome> {
  const usage =
    'usage: crew judgement <id> record --task T-n --ruling <file> | crew judgement <id> record <gate> --not-run --reason "<why>" --task T-n';
  const record = findTask(work, task);
  if ("refused" in record) return refuse(record.refused);
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
  // The todo's upheld defects asked of Jev as the item's are (SP3 decision 10); the answers go on
  // the item's evidence, the marks on the todo's records; the item's route decides the wait.
  const defects = await askDefects(
    env,
    ioEnv,
    records,
    join(reviewDir(env.paths, work.id, task), "diff.patch"),
  );
  const notes: string[] = [];
  const appendRefusal = appendVerifications(env, work.id, defects?.records ?? []);
  if (appendRefusal) notes.push(appendRefusal);
  const jevWait = jevUnavailableWait(work, defects);
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
  const lines = records.flatMap((r) => {
    const detail =
      r.verdict === "not-run" ? `: ${r.reason}` : ` (${findingsText(r.findings.length)})`;
    return [`${task}: ${r.gate} ${verdictWord(r.verdict)}${detail}`, ...markLines(r)];
  });
  // A briefed todo whose judgement is pending again says so, never "gated" (finding 75).
  lines.push(
    pending.length === 0
      ? `${task}: gated`
      : record.state === "briefed"
        ? `${task}: briefed, judgement pending (${pendingText(record, pending)})`
        : `${task}: not gated: ${pendingText(record, pending)}`,
  );
  if (jevWait) lines.push(jevWait);
  lines.push(...notes);
  return {
    code: pending.length === 0 ? 0 : 1,
    stdout: true,
    text: lines.join("\n"),
    data: { task: record, gate: record.gate, pending },
  };
}

/**
 * The origin's known root causes as the guard out of analyse reads them (SP4 Task 5, rule 17): an
 * entry the base no longer holds is dropped; contradicted when a ref of the entry names this item
 * in this project (a same-named item of another project counts for nothing).
 */
function knownCausesOf(env: Env, work: WorkItem): GuardContext["knownRootCauses"] {
  const known = readOrigin(env.paths, work.id)?.origin?.knownRootCauses ?? [];
  if (!known.length) return [];
  const entries = readBase(env.paths.userDir).base?.entries ?? [];
  const project = env.mail.self.project;
  const out: GuardContext["knownRootCauses"] = [];
  for (const k of known) {
    const entry = entries.find((e) => e.id === k.id);
    if (!entry) continue;
    out.push({
      id: k.id,
      title: k.title,
      paths: k.paths,
      contradicted: entry.contradictedBy.some((r) => r.item === work.id && r.project === project),
    });
  }
  return out;
}

function guardContext(env: Env, work: WorkItem, tampered: boolean): GuardContext {
  const dir = workDir(env.paths, work.id);
  const result = assess(env.paths, work, env.profile, env.policy, env.tampered || tampered);
  return {
    specText: readText(join(dir, "spec.md")),
    strategyText: readText(join(dir, "strategy.md")),
    researcherText: readText(join(dir, "conclave", "researcher.md")),
    analysisText: readText(join(dir, "analysis.md")),
    originRecorded: existsSync(join(dir, "analysis", "origin.json")),
    knownRootCauses: knownCausesOf(env, work),
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
  return renderReport(work, evidence, env.policy, {
    ledger: loadLedger(env.paths, work.id).ledger,
    mail: loadItemMail(env.paths, work.id),
    selfName: env.mail.self.project,
    analysis: readOrigin(env.paths, work.id) ?? undefined,
    strategy: strategyOf(env, work, evidence),
    audit: auditViewOf(env, work),
    knowledge: readText(join(workDir(env.paths, work.id), "knowledge.md")),
    ctoPlan: env.mail.self.workspace
      ? latestPlan(env.paths.userDir, env.mail.self.workspace)
      : null,
  });
}

/** The audit's records as the report and the status show them; null for any other kind. */
function auditViewOf(env: Env, work: WorkItem): AuditReportView | null {
  if (kindOfItem(work) !== "audit") return null;
  const s = auditState(env.paths, work);
  return {
    runSummary: s.run ? auditSummary(s.run.runs) : null,
    head: s.run?.head ?? null,
    runAtHead: s.runAtHead,
    filed: s.filed,
    report: s.report
      ? {
          md: s.report.md,
          html: s.report.html,
          pdf: s.report.pdf,
          pdfReason: s.report.pdfReason,
          verdict: s.report.verdict,
        }
      : null,
    reportCurrent: s.reportCurrent,
    signed: auditSignature(work),
  };
}

/** The signature an audit's report carries: the approval, when a person signed. */
function auditSignature(work: WorkItem): ReportSignature | null {
  const approval = work.approvals.find((a) => a.what === "audit");
  return approval
    ? { at: approval.at, by: approval.by ?? "user", relayed: approval.relayed === true }
    : null;
}

/**
 * The report rendered from the audit folder (SP7 §13.2, SP8 Task 5): the Markdown and the HTML
 * written, the PDF printed or its absence said, `report.json` stamped with the inputs' hash.
 */
async function renderAudit(
  env: Env,
  io: CliIo,
  work: WorkItem,
  signed: ReportSignature | null,
): Promise<Outcome> {
  const dir = workDir(env.paths, work.id);
  const auditDir = join(dir, "audit");
  const assembled = assembleAuditReport({
    auditDir,
    logsDir: join(dir, "logs"),
    root: env.paths.root,
    id: work.id,
    project: env.mail.self.project,
    date: nowIso().slice(0, 10),
    signed,
    // Rule 3 of SP7 §5: a remote environment like production is recommended; the report says so when the profile has none.
    remoteEnvironmentNote: !env.profile.environment,
  });
  if ("refused" in assembled) return refuse(assembled.refused);
  const { inputs, counts } = assembled;
  const brand = brandOf(io.env, env.paths.root);
  writeProtectedText(env.paths, join(auditDir, "report.md"), renderAuditMarkdown(inputs));
  writeProtectedText(env.paths, join(auditDir, "report.html"), renderAuditHtml(inputs, brand));
  // A PDF of an earlier render never outlives a print that fails.
  const pdfPath = join(auditDir, "report.pdf");
  rmSync(pdfPath, { force: true });
  const printed = await printPdf(join(auditDir, "report.html"), pdfPath, io.env, env.paths.root, {
    logPath: join(dir, "logs", "audit-pdf.txt"),
  });
  const record: ReportRecord = {
    at: nowIso(),
    hash: reportHash(auditDir),
    md: "audit/report.md",
    html: "audit/report.html",
    pdf: printed.ok ? "audit/report.pdf" : null,
    pdfReason: printed.ok ? null : printed.reason,
    leftOut: inputs.leftOut,
    counts,
    verdict: inputs.verdict,
    signed,
  };
  writeProtectedJson(env.paths, join(auditDir, "report.json"), record);
  const kept = Object.values(counts).reduce((n, c) => n + c.defects + c.advisories, 0);
  const next = signed
    ? `crew phase ${work.id} next`
    : `crew approve ${work.id} audit (a person signs), then crew phase ${work.id} next`;
  return ok(
    `audit report of ${work.id}: verdict ${inputs.verdict}; ${kept} finding${kept === 1 ? "" : "s"} kept, ${inputs.leftOut.length} left out for want of proof; audit/report.md, audit/report.html, ${printed.ok ? `audit/report.pdf (${printed.by})` : `pdf not produced: ${printed.reason}`}${brand ? "" : "; brand assets not found"}\nnext: ${next}`,
    { report: record },
  );
}

/** The strategy of a new project as it stands, for the status and the report; null for any other item or before the document exists. */
function strategyOf(env: Env, work: WorkItem, evidence: Evidence): StrategyReport | null {
  if (!phasesFor(work).includes("strategy")) return null;
  const dir = workDir(env.paths, work.id);
  return strategyReport(
    readText(join(dir, "strategy.md")),
    readText(join(dir, "conclave", "researcher.md")),
    evidence,
    work.knowledge?.listed ?? [],
  );
}

/** `ok`, `n faults` or `no strategy.md yet`, then the ruling's state, for the status line. */
function strategyLine(report: StrategyReport | null, planned: PlannedStrategyJudgement): string {
  const state =
    report === null
      ? "no strategy.md yet"
      : report.faults.length
        ? `${report.faults.length} fault${report.faults.length === 1 ? "" : "s"}`
        : "ok";
  const r = report?.ruling;
  const ruling = !r
    ? "none"
    : r.stale
      ? "stale"
      : r.verdict === "proven"
        ? "proven"
        : `${verdictText(r.verdict)} (${r.findings} findings)`;
  return `  strategy ${RESEARCH_AND_BASE}: ${state}; ruling ${ruling}; gate ${planned.gate} planned: ${planned.reason}`;
}

/** The audit block of `crew status --json`: the run's summary, the findings' counts, the report's files and state, the signature. */
function auditStatusOf(env: Env, work: WorkItem): Record<string, unknown> {
  const s = auditState(env.paths, work);
  return {
    run: s.run ? { at: s.run.at, head: s.run.head, summary: auditSummary(s.run.runs) } : null,
    runAtHead: s.runAtHead,
    filed: s.filed,
    report: s.report
      ? {
          at: s.report.at,
          md: s.report.md,
          html: s.report.html,
          pdf: s.report.pdf,
          pdfReason: s.report.pdfReason,
          verdict: s.report.verdict,
          current: s.reportCurrent,
        }
      : null,
    signed: s.signed !== null,
  };
}

/** The audit's status line: the runs counted by state with the failing and the unavailable gates named, or none yet. */
function auditLine(env: Env, work: WorkItem): string {
  const dir = join(workDir(env.paths, work.id), "audit");
  const runs = readJson<AuditRuns>(join(dir, "runs.json"));
  if (!runs) return `  audit run: none yet (crew audit ${work.id} run)`;
  const scope = readJson<AuditScope>(join(dir, "scope.json"));
  return `  audit run: ${auditSummary(runs.runs)}; files ${scope?.files ?? 0}`;
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
 * The request this item answers follows its waits (SP7 §9): blocked while the turn ends on one,
 * in progress again at the resume; a message past that point (done) is left as it is. Used by
 * `crew await`, `crew resume` and the questions record (SP3 Task 4). What the move could not do (a
 * copy of the message it could not update, a refused move) is pushed onto `notes`, the line the
 * command prints under its answer; the move itself never refuses the command.
 */
function moveOriginMail(
  env: Env,
  work: WorkItem,
  to: "blocked" | "in-progress",
  notes: string[],
): void {
  const originId = work.origin?.mail;
  if (!originId) return;
  const current = ownInbox(env.mail).messages.find((m) => m.id === originId);
  if (!current || mailStatus(current) === to) return;
  const moved = moveMail(env.mail, originId, to, {}, notes);
  if ("refused" in moved) notes.push(moved.refused);
}

/** The origin's notes a wait or a resume carries under its answer (moveOriginMail). */
function withNotes(text: string, notes: readonly string[]): string {
  return notes.length ? `${text}\n${notes.join("\n")}` : text;
}

/** `crew await <id> user | role | mail <mid>`: the three waits a turn may end on (SP2c §9), the origin blocked. */
function awaitCommand(env: Env, args: string[]): Outcome {
  const opened = openForChange(env, args[0]);
  if (isOutcome(opened)) return opened;
  const usage = "usage: crew await <id> user | role | mail <message id>";
  const kind = args[1];
  if (kind !== "user" && kind !== "role" && kind !== "mail") return refuse(usage);
  if (kind === "mail" && !args[2]) return refuse(usage);
  opened.work.awaiting = kind;
  if (kind === "mail") opened.work.awaitingMessage = args[2];
  else delete opened.work.awaitingMessage;
  saveWork(env.paths, opened.work);
  const notes: string[] = [];
  moveOriginMail(env, opened.work, "blocked", notes);
  return ok(withNotes(`${opened.work.id}: ${waitingPhrase(opened.work) ?? ""}`, notes), {
    awaiting: kind,
    awaitingMessage: opened.work.awaitingMessage ?? null,
  });
}

/**
 * `crew resume <id>`: the wait cleared, the origin in progress again. A jev dispute held on the
 * item is a person's to clear (finding 94): the hook asks for this resume, and with nobody present
 * it is refused.
 */
function resumeCommand(env: Env, parsed: Parsed, args: string[]): Outcome {
  const opened = openForChange(env, args[0]);
  if (isOutcome(opened)) return opened;
  let cleared = "";
  if (opened.work.validatorDispute) {
    const decided = decisionFlag(parsed, env.policy);
    if (isOutcome(decided)) return decided;
    if (decided.by !== "user")
      return refuse(
        "the validator's verdict was disputed by jev; a person clears it: the item waits",
      );
    const by = whoDecides(decided);
    decide(env, opened.work.id, {
      kind: "dispute",
      text: `jev dispute cleared (${opened.work.validatorDispute.condition})`,
      by,
    });
    delete opened.work.validatorDispute;
    cleared = `; the jev dispute cleared by ${by}`;
  }
  opened.work.awaiting = null;
  delete opened.work.awaitingMessage;
  saveWork(env.paths, opened.work);
  const notes: string[] = [];
  moveOriginMail(env, opened.work, "in-progress", notes);
  return ok(withNotes(`${opened.work.id}: resumed${cleared}`, notes), {
    awaiting: null,
    awaitingMessage: null,
  });
}

/** The upheld defects asked of Jev when it is configured and the policy allows the ask (SP3 decision 10); null otherwise. */
async function askDefects(
  env: Env,
  ioEnv: NodeJS.ProcessEnv,
  records: JudgementRecord[],
  patchFile: string,
): Promise<DefectsOutcome | null> {
  const jev = jevConfig(ioEnv, env.config);
  if (!jev.configured || !askAllowed(env.policy, "defect")) return null;
  // The marks land on the findings here, where the records are the caller's (finding 90).
  return applyDefectMarks(await verifyDefects(jev, env.policy, records, readText(patchFile) ?? ""));
}

/** One line per marked finding under its gate's line: `    <file>:<line> verified by jev (0.93)`. */
function markLines(record: JudgementRecord): string[] {
  return record.findings
    .filter((f) => f.verification)
    .map((f) => {
      const v = f.verification as FindingVerification;
      const mark =
        v.status === "unverified"
          ? `unverified: ${v.reason ?? "no reason"}`
          : `${v.status} by jev${v.confidence !== undefined ? ` (${two(v.confidence)})` : ""}`;
      return `    ${f.file}${f.line ? `:${f.line}` : ""} ${mark}`;
    });
}

/**
 * `crew policy set <list key> <glob> [--remove]`: one glob at a time (finding 120). The user's
 * decision is recorded before the file is written, so a loosening never exists without its record;
 * "already listed" and every refusal record nothing.
 */
function setListKey(env: Env, key: string, value: string, remove: boolean): Outcome {
  const plan = planListChange(env.paths, key, value, remove);
  if ("refused" in plan) return refuse(plan.refused);
  if (plan.action !== "already listed") {
    decide(env, "policy", {
      kind: "decision",
      text:
        plan.action === "added"
          ? `${key}: ${value} added, paths matching it never raise the route (ADR 0003)`
          : `${key}: ${value} removed, paths matching it raise the route again`,
      by: "the user",
    });
    writeListChange(env.paths, plan);
  }
  const now = plan.list.length ? plan.list.join(", ") : "nothing";
  return ok(`policy ${key}: ${value} ${plan.action} (now: ${now})`, {
    key,
    value,
    action: plan.action,
    list: plan.list,
  });
}

/**
 * `crew policy set <cap> <value> --mode <mode> --validator policy-change` where nobody watches
 * (finding 122, ADR 0012): allowed by `unattendedPolicyChange` alone, in a mode that shows no
 * prompt, on a policy file the engine wrote; the register entry, with the old and the new value, is
 * written before the file. A refusal before the entry writes neither; a write that fails after it
 * adds a second entry saying the change was not written.
 */
function lowerByValidator(
  env: Env,
  parsed: Parsed,
  key: string,
  value: string,
  remove: boolean,
): Outcome {
  const mode = parsed.flags.mode;
  if (mode !== "dontAsk" && mode !== "bypassPermissions")
    return refuse(
      "an unattended policy change runs in a mode that shows no prompt: --mode dontAsk or bypassPermissions",
    );
  if (loadPolicy(env.paths).tampered)
    return refuse(
      "the policy file changed outside the engine: a person accepts it first (crew policy accept)",
    );
  const change = unattendedPolicyChange(env.policy, key, value, {
    rule: parsed.flags.validator,
    remove,
  });
  if ("refused" in change) return refuse(change.refused);
  const entry = {
    kind: "decision" as const,
    by: `the validator (rule: ${POLICY_CHANGE_RULE}), in ${mode} mode`,
    rule: POLICY_CHANGE_RULE,
    mode,
  };
  decide(env, "policy", {
    ...entry,
    text: `${change.key}: ${change.from} → ${change.to}, lowered by the validator`,
  });
  let written: ReturnType<typeof setPolicyValue>;
  try {
    written = setPolicyValue(env.paths, change.key, value);
  } catch (error) {
    written = { refused: (error as Error).message };
  }
  if ("refused" in written) {
    // The entry came first, so a change never exists without its record; a write that then fails
    // is recorded too, so the register never reads as a change that was not made.
    decide(env, "policy", { ...entry, text: `${change.key}: not written, ${written.refused}` });
    return refuse(written.refused);
  }
  return ok(`policy ${change.key}: ${change.from} → ${change.to}, lowered by the validator`, {
    ...change,
    mode,
  });
}

/** `crew policy set <scalar key> <value>`: written through the engine; the standing grant, the second loosening a policy may carry (SP7b decision 15), on record. */
function setScalarKey(env: Env, key: string, value: string): Outcome {
  const result = setPolicyValue(env.paths, key, value);
  if ("refused" in result) return refuse(result.refused);
  if (key === "team.continuations" && value === "granted")
    decide(env, "policy", {
      kind: "decision",
      text: "team.continuations set to granted: rounds past a cap are the user's standing grant, up to the cap plus two",
      by: "the user",
    });
  return ok(`policy ${key}: ${value}`, result);
}

/**
 * `crew criteria <id> supersede <AC-n> --by <AC-m>`: a criterion's text replaced by another's, on
 * record (finding 118's list). The rules (the kinds' rank, the objections' bindings, the chain)
 * live in `supersedeCriterion`; the register entry is the agent's, an amendment of the spec.
 */
function supersedeCommand(env: Env, opened: Opened, parsed: Parsed, args: string[]): Outcome {
  const by = typeof parsed.flags.by === "string" ? parsed.flags.by.trim() : "";
  if (!args[2] || !by) return refuse("usage: crew criteria <id> supersede <AC-n> --by <AC-m>");
  const outcome = supersedeCriterion(
    opened.work,
    args[2],
    by,
    loadLedger(env.paths, opened.work.id).ledger,
  );
  if ("refused" in outcome) return refuse(outcome.refused);
  saveWork(env.paths, opened.work);
  decide(env, opened.work.id, {
    at: outcome.at,
    kind: "supersede",
    id: outcome.criterion.id,
    text: `${outcome.criterion.id} superseded by ${by}`,
    by: "the agent",
  });
  return ok(`${outcome.criterion.id} superseded by ${by}`, { criterion: outcome.criterion });
}

/** A test-first record: the run outside any lock, the record applied under it (finding 81; its own function, finding 82). */
async function tddCommand(env: Env, parsed: Parsed, args: string[]): Promise<Outcome> {
  const [step, id, criterion] = args;
  const opened = openForChange(env, id);
  if (isOutcome(opened)) return opened;
  if (!["red", "green", "before", "after", "observed"].includes(step ?? "") || !criterion)
    return refuse(
      'usage: crew tdd <red|green|before|after|observed> <id> <criterion> [--reason "<why>"] [-- <cmd>]',
    );
  const { evidence } = loadEvidence(env.paths, opened.work.id);
  const override = parsed.rest.length ? parsed.rest : undefined;
  const reason = typeof parsed.flags.reason === "string" ? parsed.flags.reason : undefined;
  // An observed run reads the artefact it observes, never the project's test command by default
  // (the user's decision of 2026-10-23); a missing reason is refused first, by recordTdd.
  if (step === "observed" && reason?.trim() && !override)
    return refuse("crew tdd observed needs -- <a command that reads the artefact>");
  const outcome = await withRunning(
    env.paths,
    opened.work.id,
    env.session,
    `crew tdd ${step} ${opened.work.id} ${criterion}`,
    () =>
      recordTdd(
        env.paths,
        opened.work,
        evidence,
        env.profile,
        criterion,
        step as TddStep,
        override,
        reason,
      ),
  );
  const tail = outcome.record?.tail ? `\n${outcome.record.tail}` : "";
  if (!outcome.ok) return refuse(`${outcome.message}${tail}`, { record: outcome.record });
  // The record goes into the evidence as it stands now, under the lock: a run that took minutes
  // merges with what landed meanwhile. A refusal (the file edited outside the engine during the
  // run, a lock held) records nothing and says the run passed and where its log is.
  const saved = updateEvidence(env.paths, opened.work.id, outcome.apply);
  if ("refused" in saved)
    return refuse(`${saved.refused} (the ${step} run passed: ${outcome.record?.log ?? "no log"})`, {
      record: outcome.record,
    });
  return ok(outcome.message, { record: outcome.record });
}

/** The channels the engine posts a doubt to itself (the questions file beside a document, the notice to the project's own box); a refusal is a note and the channel stays the skill's to post (finding 86). */
function postQuestionChannels(
  env: Env,
  work: WorkItem,
  question: QuestionRecord,
  text: string,
): string[] {
  const notes: string[] = [];
  for (const channel of question.channels) {
    if (channel.kind === "document" && work.source?.documentPath) {
      const written = postDocumentQuestion(env.paths.root, work.source.documentPath, question);
      if ("refused" in written) notes.push(`document not posted: ${written.refused}`);
      else {
        channel.posted = true;
        channel.ref = written.file;
      }
    } else if (channel.kind === "mail") {
      const sent = send(
        env.mail,
        {
          to: ".",
          type: "notice",
          subject: `${question.id} of ${work.id}`,
          text: `${question.id} of ${work.id}: ${text}`,
          item: work.id,
        },
        work,
      );
      if ("refused" in sent) notes.push(`mail not posted: ${sent.refused}`);
      else {
        channel.posted = true;
        channel.ref = sent.message.id;
      }
    }
  }
  return notes;
}

/** The verifications of one ask appended to the item's evidence under its lock; the refusal, if the save was refused, else null (finding 90). */
function appendVerifications(env: Env, id: string, records: Verification[]): string | null {
  if (!records.length) return null;
  const appended = updateEvidence(env.paths, id, (fresh) => {
    fresh.verifications = [...(fresh.verifications ?? []), ...records];
  });
  return "refused" in appended ? appended.refused : null;
}

/**
 * Jev down at a record (SP3 decision 12): a full-route item waits for a person after the record
 * when it has no wait yet; the line that says so, or the plain unavailability on another route.
 */
function jevUnavailableWait(work: WorkItem, defects: DefectsOutcome | null): string | null {
  if (!defects?.unavailable) return null;
  if (work.route !== "full") return `jev unavailable: ${defects.unavailable}`;
  if (work.awaiting === null) {
    work.awaiting = "user";
    delete work.awaitingMessage;
  }
  return `jev unavailable: ${defects.unavailable}; a full-route item waits for a person`;
}

/** `jev proposes normal (0.86; production down 0.02, signed deadline 0.05, vague 0.10), capped at the source's high`, or why there is no proposal. */
function triageProposalText(outcome: TriageOutcome, proposed: MailPriority): string {
  if (!outcome.proposal) {
    const reason = outcome.reason ?? "no answer";
    return reason.startsWith("jev unavailable: ") ? reason : `jev: no proposal (${reason})`;
  }
  const p = outcome.proposal;
  const flags = `production down ${two(p.flags.is_production_down ?? 0)}, signed deadline ${two(p.flags.names_a_signed_deadline ?? 0)}, vague ${two(p.flags.is_vague ?? 0)}`;
  return `jev proposes ${p.level} (${two(p.confidence)}; ${flags})${p.capped ? `, capped at the source's ${proposed}` : ""}`;
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

async function classify(
  env: Env,
  work: WorkItem,
  answers: Answers,
  context: KindContext,
  ioEnv: NodeJS.ProcessEnv,
): Promise<void> {
  const decision = computeRoute(answers, [], env.policy);
  applyClassification(work, answers.work_type, decision, kindOf(answers, context));
  logDecision(env, work, answers);
  await lookupForItem(env, work, ioEnv);
}

/**
 * The base read for an item at Recognize (SP4 Task 3, vision phase 1): the scope, the profile's
 * stacks and the request's words, the hits written to `knowledge.md` and recorded, Jev reordering
 * when configured, its records appended; a base the engine cannot read is said and the item goes on.
 */
async function lookupForItem(
  env: Env,
  work: WorkItem,
  ioEnv: NodeJS.ProcessEnv,
  options: { paths?: readonly string[]; base?: ReturnType<typeof readBase> } = {},
): Promise<string> {
  const file = join(workDir(env.paths, work.id), "knowledge.md");
  const readAt = nowIso();
  // The base as the caller read it (crew analyse reads it once for the known causes and the lookup), or read here.
  const read = options.base ?? readBase(env.paths.userDir);
  if (read.base === null) {
    const unreadable = read.reason === "missing" ? null : read.reason;
    const text = knowledgeText(work.id, [], unreadable);
    writeProtectedText(env.paths, file, text);
    work.knowledge = { readAt, listed: [], ...(unreadable ? { unreadable } : {}) };
    return text;
  }
  const scope = scopeOf(env.paths, env.mail.self);
  const stacks = [...new Set(env.profile.targets.map((t) => t.stack))];
  // No paths at classification; an issue's origin paths join the query at crew analyse (Task 5).
  const hits = lookup(read.base, {
    scope,
    stacks,
    paths: options.paths ?? [],
    words: words(work.title),
  });
  const ranked = await rerankHits(
    jevConfig(ioEnv, env.config),
    env.policy,
    { title: work.title, kind: kindOfItem(work) },
    hits,
  );
  const text = knowledgeText(work.id, ranked.hits, null);
  writeProtectedText(env.paths, file, text);
  work.knowledge = { readAt, listed: ranked.hits.map((h) => h.entry.id) };
  if (ranked.records.length) appendVerifications(env, work.id, ranked.records);
  return text;
}

/**
 * The registered projects of a workspace (this project alone with none), the base's figures over
 * what this project reads and their metrics, as `crew metrics --workspace` and `crew cto review`
 * compute them (SP4 Task 5; one helper, SP6 Task 1 AC-5); null when no project is registered.
 */
function workspaceFigures(
  env: Env,
  workspace: string | null,
): {
  figures: ReturnType<typeof knowledgeFigures>;
  metrics: ReturnType<typeof computeMetrics>;
} | null {
  const roots = workspace
    ? loadRegistry(env.paths.userDir)
        .projects.filter((p) => p.workspace === workspace && !p.worktreeOf)
        .map((p) => p.root)
    : [env.paths.root];
  if (!roots.length) return null;
  const projects = roots.map((root) => pathsFor(root, env.paths.userDir));
  const figures = knowledgeFigures(
    readBase(env.paths.userDir).base,
    scopeOf(env.paths, env.mail.self),
    projects,
  );
  return { figures, metrics: computeMetrics(projects, figures) };
}

/** The registrations as `crew status --json` and `crew pack list --json` carry them (SP6 Task 2), from one listing the caller took. */
function packsJson(listed: readonly PackListing[]): Record<string, unknown>[] {
  return listed.map((p) => ({
    name: p.name,
    version: p.registration?.version ?? null,
    kind: p.registration?.manifest.kind ?? null,
    root: p.registration?.root ?? null,
    by: p.registration?.by ?? null,
    state: stateText(p.state),
  }));
}

/** `knowledge: 2 listed (1 marked)`, `knowledge: none` or why the base could not be read, for the status block. */
function knowledgeLine(env: Env, work: WorkItem): string | null {
  const record = work.knowledge;
  if (!record) return null;
  if (record.unreadable) return `  knowledge: none (base unreadable: ${record.unreadable})`;
  if (!record.listed.length) return "  knowledge: none";
  const entries = readBase(env.paths.userDir).base?.entries ?? [];
  const marked = record.listed.filter(
    (id) => entries.find((e) => e.id === id)?.confidential !== false,
  ).length;
  return `  knowledge: ${record.listed.length} listed (${marked} marked)`;
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

/** `answers filed by the session: <agents>` when any role record was the session's (SP6 Task 4 AC-5); empty otherwise. */
function sessionFiledLine(roles: readonly RoleRecord[]): string {
  const agents = [...new Set(roles.filter((r) => r.filedBy === "session").map((r) => r.agent))];
  return agents.length ? `answers filed by the session: ${agents.join(", ")}` : "";
}

/** A hook answer's `systemMessage` the runtime could not carry, left as a notice for the session's next context; nothing when no context can be built. */
function leaveNoticeFor(payload: HookPayload, env: NodeJS.ProcessEnv, text: string): void {
  try {
    const ctx = buildContext(payload, env);
    if (ctx) leaveNotice(ctx, text);
  } catch {
    // The hook fails open: a notice that cannot be kept costs the session nothing.
  }
}

/**
 * The active item learns the runtime whose hook observed it (SP6 Task 4), once per name, fail-open.
 * A name the item already holds takes no lock (judgement round 2: the hooks run on every tool call
 * beside the roles' filings, which share the folder's lock); `noteRuntime` checks again under it.
 */
function observeRuntime(payload: HookPayload, env: NodeJS.ProcessEnv, runtime: string): void {
  try {
    const paths = resolvePaths(payload.cwd ?? "", env);
    const active = paths ? activeWork(paths) : null;
    if (paths && active?.work && !active.tampered && !active.work.runtimes?.includes(runtime))
      noteRuntime(paths, active.work.id, runtime);
  } catch {
    // As above.
  }
}

/** The real path of `path`, links followed, or `path` itself when it does not exist. */
function realOrSelf(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/** Whether `path` is under `folder`: a relative path that never climbs out of it. */
function insideFolder(path: string, folder: string): boolean {
  const rel = relative(folder, path);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

/** `crew mail …`: the project's mail inside the workspace and the sessions it opened (SP2c, SP7b). */
async function mailCommand(env: Env, parsed: Parsed, args: string[]): Promise<Outcome> {
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
    const note = work ? "" : "\nnote: no active work item, so no item keeps a copy of this message";
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
    if ("refused" in result)
      return refuse(
        result.delivered === undefined
          ? result.refused
          : `${result.delivered} was delivered, but ${result.refused}`,
      );
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
    if (priority !== undefined && !isMailPriority(priority)) return refuse(badPriority(priority));
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

/**
 * `crew status` of one item: the person's view of where it stands (the phase, the waits, the
 * branch, the todo, the roles working, the gates) as text, and the machine form the mod draws.
 */
function statusView(env: Env, active: Opened): Outcome {
  const result = assess(
    env.paths,
    active.work,
    env.profile,
    env.policy,
    env.tampered || active.tampered,
  );
  const work = active.work;
  // The checkout's branch, the plan's todo and the roles working (SP7 §14): the person's view of
  // who does what now. A branch name is one cleaned line, as a role's description (finding 58); none
  // outside a git repository.
  let branch: string | null = null;
  try {
    const name = gitRun(env.paths.root, "rev-parse", "--abbrev-ref", "HEAD").trim();
    branch = name ? oneLine(name) : null;
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
  if (work.source) extra.unshift(`  source ${oneLine(sourceLine(work.source))}`);
  // What the base listed at classification (SP4 Task 3), and what is left to learn (Task 4).
  const knowledge = knowledgeLine(env, work);
  if (knowledge) extra.push(knowledge);
  const learned = work.learned;
  const learnLine = learned
    ? `  learn: ${learnedText(learned.entries, learned.confirmed)}`
    : work.phase === "learn"
      ? `  learn: proven, not learned: crew learn ${work.id}`
      : work.phase === "deliver" && result.verdict === "proven"
        ? `  learn: proven; crew phase ${work.id} next, then crew learn ${work.id} writes the base`
        : null;
  if (learnLine) extra.push(learnLine);
  // A template the policy names and no pack registers (SP6 Task 2 AC-4): said on its own line.
  const registry = teamsFor(env.policy, packTemplates(env.paths.userDir));
  if (registry.warning) extra.push(`  ${registry.warning}`);
  // The strategy while it is written and judged (SP7 §7.3): its faults and its ruling.
  const plannedStrategy = work.phase === "strategy" ? plannedStrategyJudgement(work)[0] : undefined;
  if (plannedStrategy)
    extra.unshift(strategyLine(strategyOf(env, work, result.evidence), plannedStrategy));
  // The audit's runs while the item is audited (SP8 Task 4): counted by state, or the command to run.
  if (work.phase === "audit") extra.unshift(auditLine(env, work));
  // The origin while the item is analysed (SP7 §7.4): its size, or a hand edit named.
  const analysis = work.phase === "analyse" ? readOrigin(env.paths, work.id) : null;
  if (analysis)
    extra.unshift(
      analysis.origin
        ? `  analysis: ${originSummary(analysis.origin)}`
        : `  analysis: origin.json changed outside the engine (crew accept ${work.id})`,
    );
  // The open questions first (SP7 §10.3): a doubt a person has to answer comes before everything.
  extra.unshift(
    ...openQuestions(work).map(
      (q) => `  question ${q.id} open: ${oneLine(q.text)} (${channelsText(q)})`,
    ),
  );
  const text = `${work.id} "${work.title}"\n  phase ${work.phase}, ${work.abandoned ? `abandoned (${work.abandoned.reason}), ` : ""}route ${work.route}, kind ${kindOfItem(work)}, ${triageText(work, "status")}${waitingText(work)}\n${kindOfItem(work) === "audit" ? "  audit: the proof is the signed report\n" : ""}${extra.length ? `${extra.join("\n")}\n` : ""}${gateSummary(work, result.verdict, result.unproven, result.evidence.runs)}`;
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
    questions: questionsSorted(work).map(questionJson),
    analysis: analysis?.origin ?? null,
    // The packs registered on this machine with their states (SP6 Task 2 AC-6).
    packs: packsJson(listPacks(env.paths.userDir)),
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
    // What the base listed at classification (SP4 Task 3) and what the item learned (Task 4).
    knowledge: work.knowledge ?? null,
    learned: work.learned ?? null,
    // An audit's checks (SP8 Task 5): what the mod's Audit block and the strip draw.
    ...(kindOfItem(work) === "audit" ? { audit: auditStatusOf(env, work) } : {}),
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

/**
 * `crew research <id> verify [--file <path>]`: the researcher's facts checked against their sources,
 * then asked of Jev (SP3 decision 10); in its own function since finding 90.
 */
async function researchCommand(
  env: Env,
  parsed: Parsed,
  args: string[],
  io: CliIo,
): Promise<Outcome> {
  const usage = "usage: crew research <id> verify [--file <path>]";
  const opened = openForChange(env, args[0]);
  if (isOutcome(opened)) return opened;
  if (args[1] !== "verify") return refuse(usage);
  const dir = workDir(env.paths, opened.work.id);
  const file =
    typeof parsed.flags.file === "string"
      ? resolve(env.paths.root, parsed.flags.file)
      : join(dir, "conclave", "researcher.md");
  const named = rel(env.paths, file);
  if (named.startsWith("..") || isAbsolute(named))
    return refuse(`${parsed.flags.file} is not under the root`);
  const text = readText(file);
  if (text === null) return refuse(`no researcher file at ${named}`);
  const facts = parseFacts(text);
  // A research with nothing to verify is not a blocker: the strategy's marks name its lines either way (SP8 Task 6).
  if (!facts.length)
    return ok(
      `no fact to verify in ${named}: a code fact is "- <path from the root>:<line> · <sentence>", a documentation fact "- <URL or document> · "<quote>" · <meaning>"; the strategy's marks name the file's lines either way (crew strategy ${opened.work.id} check), so go on`,
      { facts: [] },
    );
  const jev = jevConfig(io.env, env.config);
  const asking = jev.configured && askAllowed(env.policy, "fact");
  type Status = {
    id: string;
    source: string;
    status: "verified" | "disputed" | "unverified" | "not-found";
    reason?: string;
    confidence?: number;
  };
  const statuses = new Map<string, Status>();
  const found: FactInput[] = [];
  for (const f of facts) {
    const source = await fetchSource(f.source, env.paths.root);
    if ("refused" in source) {
      statuses.set(f.id, {
        id: f.id,
        source: f.source,
        status: "not-found",
        reason: source.refused,
      });
      continue;
    }
    const quote = findQuote(f.quote, source.text);
    if (!quote) {
      statuses.set(f.id, {
        id: f.id,
        source: f.source,
        status: "not-found",
        reason: `the quote is not in ${f.source}`,
      });
      continue;
    }
    found.push({ id: f.id, claim: f.claim, quote: f.quote, excerpt: quote.excerpt });
  }
  let tail: string | null = null;
  let records: Verification[] = [];
  if (found.length && !asking) {
    const notAsked = jev.configured
      ? "jev not asked: fact is not in verify.asks"
      : "jev not configured";
    for (const f of found)
      statuses.set(f.id, {
        id: f.id,
        source: facts.find((x) => x.id === f.id)?.source ?? "",
        status: "unverified",
        reason: notAsked,
      });
    tail = notAsked;
  } else if (found.length) {
    const out = await verifyFacts(jev, env.policy, found);
    records = out.records;
    for (const f of found) {
      const mark = out.marks[f.id];
      statuses.set(f.id, {
        id: f.id,
        source: facts.find((x) => x.id === f.id)?.source ?? "",
        status: mark?.status ?? "unverified",
        ...(mark?.reason ? { reason: mark.reason } : {}),
        ...(mark && mark.confidence !== null ? { confidence: mark.confidence } : {}),
      });
    }
    if (out.unavailable) tail = `jev unavailable: ${out.unavailable}`;
  }
  const ordered = facts.map((f) => statuses.get(f.id) as Status);
  writeProtectedJson(env.paths, join(dir, "conclave", "researcher.verification.json"), {
    at: nowIso(),
    hash: sha256(text),
    facts: ordered,
  });
  if (records.length) {
    const appended = updateEvidence(env.paths, opened.work.id, (fresh) => {
      fresh.verifications = [...(fresh.verifications ?? []), ...records];
    });
    if ("refused" in appended) tail = tail ? `${tail}; ${appended.refused}` : appended.refused;
  }
  const counts = (["verified", "disputed", "unverified", "not-found"] as const)
    .map((s) => [s, ordered.filter((x) => x.status === s).length] as const)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${n} ${s}`);
  const reasons = ordered
    .filter((x) => x.status === "not-found")
    .map((x) => `${x.id}: ${x.reason}`);
  if (tail) reasons.push(tail);
  const n = facts.length;
  return ok(
    `${n} fact${n === 1 ? "" : "s"}: ${counts.join(", ")}${reasons.length ? ` (${reasons.join("; ")})` : ""}`,
    { facts: ordered, file: "conclave/researcher.verification.json" },
  );
}

async function dispatch(parsed: Parsed, io: CliIo): Promise<Outcome> {
  const [command, ...args] = parsed.positional;
  if (parsed.flags.version || command === "version") return ok(VERSION, { version: VERSION });
  if (command === "hook") {
    // The runtime the hook runs under (SP6 Task 4): its reader turns the payload into the engine's,
    // its writer turns the engine's answer into its shape; `claude` is today's path byte for byte.
    // An unknown runtime is refused before stdin is read.
    const event = args[0] ?? "";
    const runtimeName = typeof parsed.flags.runtime === "string" ? parsed.flags.runtime : "claude";
    const runtime = runtimeOf(runtimeName);
    if (!runtime) return refuse(`unknown runtime ${runtimeName} (crew runtime list)`);
    let raw: unknown = {};
    try {
      const text = await io.stdin();
      raw = text.trim() ? JSON.parse(text) : {};
    } catch {
      raw = {};
    }
    const engineEvent = (ENGINE_EVENTS as readonly string[]).includes(event)
      ? (event as EngineEvent)
      : null;
    const payload: HookPayload = engineEvent
      ? runtime.readPayload(engineEvent, raw, io.cwd)
      : typeof raw === "object" && raw !== null && !Array.isArray(raw)
        ? (raw as HookPayload)
        : {};
    if (typeof payload.cwd !== "string") payload.cwd = io.cwd;
    const response = handleHook(event, payload, io.env);
    const written = engineEvent
      ? runtime.writeResponse(engineEvent, response)
      : { stdout: JSON.stringify(response), exitCode: 0, dropped: null };
    // A systemMessage the runtime has no field for is kept as a notice the next context carries
    // (the subagent-stop hook leaves its own, hooks/notices.ts, so it is not left twice); the item
    // learns which runtime observed it, once per name, from the events a session starts with.
    if (written.dropped && engineEvent !== "subagent-stop")
      leaveNoticeFor(payload, io.env, written.dropped);
    if (
      engineEvent === "session-start" ||
      engineEvent === "prompt" ||
      engineEvent === "pre-tool-use"
    )
      observeRuntime(payload, io.env, runtime.name);
    return {
      code: written.exitCode,
      text: written.stdout,
      stdout: true,
      data: { hookEvent: event },
    };
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
  // A worktree takes its main checkout's policy and profile before anything reads them (AC-5).
  try {
    for (const note of adoptMainFiles(paths)) io.stderr(`${note}\n`);
  } catch (error) {
    io.stderr(
      `the main checkout's policy and profile were not copied: ${(error as Error).message}\n`,
    );
  }
  const env = load(paths, io.env);

  switch (command) {
    case "detect": {
      if (parsed.flags.refresh) {
        const refused = tamperRefusal(env);
        if (refused) return refused;
      }
      const previous = parsed.flags.refresh ? loadProfile(env.paths).profile : null;
      const profile = parsed.flags.refresh
        ? detectProfile(env.paths.root, previous, packRules(env.paths.userDir))
        : env.profile;
      if (parsed.flags.refresh) {
        saveProfile(env.paths, profile);
        // Only bless a policy that has no recorded hash yet: re-recording here would let a tampered policy
        // pass as trusted. `crew policy accept` is the user-approved way to accept a hand edit.
        if (integrityOf(env.paths)[".crew/policy.json"] === undefined) {
          recordIntegrity(env.paths, join(env.paths.crewDir, "policy.json"));
        }
      }
      const missing = missingTestCommands(profile);
      // A pack's command and a target's tags are said where the profile is read (SP6 Task 2 AC-3),
      // the scoped test template with the same marks (round 3).
      const shown = (g: string, c: GateCommand) =>
        `${g}=${c.command}${c.source === "proposed" ? " [proposed]" : ""}${c.pack ? ` (pack ${c.pack})` : ""}`;
      const lines = profile.targets.map((t) => {
        const commands = [
          ...Object.entries(t.gates).map(([g, c]) => shown(g, c)),
          ...(t.testScoped ? [shown("testScoped", t.testScoped)] : []),
        ];
        return `  ${t.path} (${t.stack}, ${t.packageManager}${t.workspaceOf ? `, workspace of ${t.workspaceOf}` : ""}): ${
          commands.join(", ") || "no commands"
        }${t.tags?.length ? `\n    tags: ${t.tags.join(", ")}` : ""}`;
      });
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
      if (sub === "set" || sub === "confirm" || sub === "unset") {
        const refused = tamperRefusal(env);
        if (refused) return refused;
      }
      if (sub === "unset") {
        // A gate removed from a target (finding 87): the user's decision, recorded; the profile
        // keeps at least one test gate, counted across every target.
        if (!GATE_NAMES.includes(gate as GateName) || gate === "secrets")
          return refuse(
            "usage: crew profile unset <build|test|lint|typecheck|deps|e2e> [--target <path>] [--stack <s>]",
          );
        const decided = decisionFlag(parsed, env.policy);
        if (isOutcome(decided)) return decided;
        const targetPath = typeof parsed.flags.target === "string" ? parsed.flags.target : ".";
        const stackFlag = typeof parsed.flags.stack === "string" ? parsed.flags.stack : undefined;
        const atPath = env.profile.targets.filter((t) => t.path === targetPath);
        if (stackFlag === undefined && atPath.length > 1)
          return refuse(
            `two targets at ${targetPath} (${atPath.map((t) => t.stack).join(", ")}): say which one with --stack`,
          );
        const target =
          stackFlag === undefined ? atPath[0] : atPath.find((t) => t.stack === stackFlag);
        if (!target) return refuse(`no target at ${targetPath} in the profile (crew detect)`);
        const where = stackFlag === undefined ? targetPath : `${targetPath} (${stackFlag})`;
        const current = target.gates[gate as GateName];
        if (!current) return refuse(`${gate} for ${where} is not set`);
        if (gate === "test" && env.profile.targets.filter((t) => t.gates.test).length <= 1)
          return refuse(
            `the profile keeps at least one test gate: test for ${where} is the last one`,
          );
        delete target.gates[gate as GateName];
        target.unset = [...new Set([...(target.unset ?? []), gate as GateName])];
        saveProfile(env.paths, env.profile);
        const text = `${gate} for ${where} unset (was: ${current.command})`;
        const by = whoDecides(decided);
        decide(env, "profile", { kind: "profile", text, by });
        return ok(`${text} ${decisionText(env.policy, decided)}`, {
          target: targetPath,
          gate,
          was: current.command,
          by,
        });
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
          block[key as EnvironmentCommand] = { command: cmd, source: "confirmed" };
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
        for (const key of ENVIRONMENT_COMMANDS) {
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
        for (const target of env.profile.targets) {
          for (const [name, command] of Object.entries(target.gates))
            if (command.source === "proposed" && (gate === undefined || name === gate)) {
              command.source = "confirmed";
              confirmed.push(`${name}: ${command.command}`);
            }
          // A pack's scoped test template is confirmed with the test gate (SP6 Task 2 AC-3): a
          // todo's gate runs it, so it is shown and trusted here like the whole command.
          const scoped = target.testScoped;
          if (
            scoped?.pack &&
            scoped.source === "proposed" &&
            (gate === undefined || gate === "test")
          ) {
            scoped.source = "confirmed";
            confirmed.push(`test (scoped): ${scoped.command}`);
          }
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
      const unattended = parsed.flags.mode !== undefined || parsed.flags.validator !== undefined;
      if (args[0] === "accept") {
        // Accepting a hand edit is a person's under every policy (ADR 0005, 0012).
        if (unattended)
          return refuse(
            "crew policy accept takes no --mode or --validator: a hand edit of the policy is accepted by a person",
          );
        return accept(env, "policy");
      }
      if (args[0] === "set") {
        const [, key, value] = args;
        if (!key || value === undefined) {
          return refuse(
            `usage: crew policy set <${Object.keys(SETTABLE_POLICY_KEYS).join("|")}> <value>`,
          );
        }
        // Asked even under relay (PreToolUse): the policy that governs signatures is signed by a prompt.
        const remove = parsed.flags.remove === true;
        const rule = SETTABLE_POLICY_KEYS[key];
        if (remove && !(rule && "list" in rule)) {
          return refuse(
            `--remove applies to a list key (${LIST_POLICY_KEYS.join(", ")}), not ${key}`,
          );
        }
        // Where nobody watches, the validator may only lower a cap, when the policy says so (ADR 0012).
        if (unattended) return lowerByValidator(env, parsed, key, value, remove);
        // Two key kinds, two helpers (finding 120's advisory): the handler reads the usage and the flag.
        if (rule && "list" in rule) return setListKey(env, key, value, remove);
        return setScalarKey(env, key, value);
      }
      return refuse("usage: crew policy accept | crew policy set <key> <value>");
    }
    case "accept": {
      if (!args[0]) return refuse(ACCEPT_USAGE);
      if (args[0] === "mail") {
        const which = args[1];
        if ((which !== "inbox" && which !== "outbox") || args.length > 2)
          return refuse(ACCEPT_USAGE);
        return acceptMailbox(env, parsed, which);
      }
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
      // The parts of a request in several parts (finding 61), checked before anything is created.
      const partsRead = parseParts(
        parsed.ordered.filter((f) => f.key === "part").map((f) => f.value),
      );
      if ("problem" in partsRead) return refuse(partsRead.problem);
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
      await classify(
        env,
        work,
        answers,
        { origin: !!origin, sourceChannel: source?.channel ?? null },
        io.env,
      );
      // The item's priority: the triage's level when a source proposed one (the proposal while
      // unconfirmed), else the flag, the origin's confirmed level, the priority answer's level, normal.
      if (triage) {
        work.triage = triage;
        work.priority = triage.confirmed ?? triage.proposed;
      } else work.priority = startPriority(priorityFlag, origin, answers);
      // The seats the route plans, before any path is known (SP7 §6.2): the leads' validation guard
      // names them from here; the gate run rewrites them with the paths the change touched.
      if (work.route !== "fast") {
        work.seats = plannedSeats(work.route, work.riskAreas, [], env.policy, {
          registry: teamsFor(env.policy, packTemplates(env.paths.userDir)).teams,
        });
        work.primaryTeam = primaryTeam([]);
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
      // The three flags repeat and keep their command-line order, so the numbers read as typed;
      // --observed opens a criterion no test can fail first (a plan, a document: the CTO review's, SP4 Task 6).
      const criteria = parsed.ordered
        .filter((f) => f.key === "criterion" || f.key === "preserve" || f.key === "observed")
        .map((f) =>
          addCriterion(
            work,
            f.value,
            f.key === "preserve" ? "preserve" : f.key === "observed" ? "observed" : "behavior",
          ),
        );
      if (partsRead.parts) work.parts = partsRead.parts;
      // On the fast route the criteria are all that stands before build; with them given, go there.
      if (work.route === "fast" && criteria.length > 0)
        advancePhase(work, guardContext(env, work, false));
      saveWork(env.paths, work);
      // The source's urgency judged by Jev (SP3 decision 10): a proposal to the lead, capped at the
      // source's, never the record; its answers on the item's evidence.
      let jevLine = "";
      if (source?.proposedPriority) {
        const jev = jevConfig(io.env, env.config);
        if (jev.configured && askAllowed(env.policy, "triage")) {
          const workspace = env.mail.self.workspace;
          const priorities = workspace ? prioritiesState(env.paths.userDir, workspace) : null;
          const outcome = await verifyTriage(jev, env.policy, {
            request: {
              text: input,
              channel: source.channel,
              connector: source.connector ?? null,
              proposed_priority: source.proposedPriority,
            },
            business_priorities: priorities?.state === "signed" ? priorities.text : null,
            queue: openItems(env.paths, work.id).map((w) => ({
              kind: kindOfItem(w),
              priority: w.priority ?? "normal",
            })),
          });
          appendVerifications(env, work.id, outcome.records);
          jevLine = `\n  ${triageProposalText(outcome, source.proposedPriority)}`;
        }
      }
      // A lowering is the lead's decision about the item (SP7 §10.2, §6.6).
      if (triage?.confirmed && triage.confirmed !== triage.proposed)
        decide(env, work.id, {
          at: triage.at,
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
      const lines =
        criteria.map((c) => `\n  ${c.id} (${c.kind}): ${c.text}`).join("") +
        (work.parts ?? []).map((p) => `\n  part ${p.id}: ${p.text}`).join("");
      // The kind and where it came from (SP7 §7.1); an issue is told what comes before its build (rule 11).
      const kindLine = `\n  ${kindLabel(work)}${
        work.kind === "issue"
          ? "\n  issue: analysis.md (Origin, Cause, Blast radius) and a preserve criterion before build (references/analyse.md)"
          : ""
      }`;
      // The source and the triage (SP7 §10): where the request came from and what the lead decided of its priority.
      const sourceLines = source ? `\n  source: ${sourceLine(source)}` : "";
      const triageLine = triage ? `\n  ${triageText(work, "start")}` : "";
      const teamLine = work.seats?.length
        ? `\n  team: ${work.seats.length} seats (crew team ${work.id})`
        : "";
      // What this project decided before (SP7 §6.6): the lead reads it in Understand.
      const registered = decisionsCount(env.paths);
      const registerLine = registered
        ? `\n  decision register: ${registered} entr${registered === 1 ? "y" : "ies"} (crew decisions)`
        : "";
      return ok(
        `${warning}${sharedWarning}${inheritedWarning}${provenNote}started ${work.id} (route ${work.route}: ${work.routeReasons.join("; ")})${kindLine}${sourceLines}${triageLine}${jevLine}${lines}${teamLine}${registerLine}${originNotes.length ? `\n${originNotes.join("\n")}` : ""}`,
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
      await classify(
        env,
        opened.work,
        answers,
        { origin: !!opened.work.origin, sourceChannel: null },
        io.env,
      );
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
      if (args[1] === "supersede") return supersedeCommand(env, opened, parsed, args);
      const text = args.slice(2).join(" ").trim();
      if (args[1] !== "add" || !text)
        return refuse(
          'usage: crew criteria <id> add "<criterion>" [--kind preserve|observed] | crew criteria <id> remove <AC-n> | crew criteria <id> supersede <AC-n> --by <AC-m>',
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
        decide(env, opened.work.id, {
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
        decide(env, opened.work.id, {
          kind: "objection",
          id: result.id,
          text: result.text,
          answer: `waived: ${reason}`,
          by: whoDecides(waiver),
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
        // The researcher's facts verified against the current file before the close (SP3 decision 10).
        const jev = jevConfig(io.env, env.config);
        const conclaveDir = join(workDir(env.paths, opened.work.id), "conclave");
        const researcherText = readText(join(conclaveDir, "researcher.md"));
        if (jev.configured && askAllowed(env.policy, "fact") && researcherText !== null) {
          const read = readProtectedJson<{ hash?: unknown }>(
            env.paths,
            join(conclaveDir, "researcher.verification.json"),
          );
          if (read.tampered || read.data?.hash !== sha256(researcherText))
            return refuse(
              `run crew research ${opened.work.id} verify first (the researcher's facts are unverified)`,
            );
        }
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
      decide(env, opened.work.id, {
        kind: "decision",
        id: result.id,
        text: result.question,
        ...(result.answer ? { answer: result.answer } : {}),
        by: whoDecides(result),
      });
      return ok(`${result.id} answered ${decidedBy(result)}: ${result.answer}`, {
        decision: result,
      });
    }
    case "audit": {
      // The audit run (SP7 §7.5, SP8 Task 4): the project's own tools over the whole tree with no
      // baseline, every result recorded and a failure never a block; the files the reviewers read
      // and the scope with its risk areas beside the runs.
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened)) return opened;
      if (args[1] !== "run" && args[1] !== "report")
        return refuse("usage: crew audit <id> run [--only a,b] | crew audit <id> report");
      const work = opened.work;
      if (kindOfItem(work) !== "audit")
        return refuse(
          `not an audit: ${work.id} is a ${kindOfItem(work)}; crew audit runs on an audit item alone`,
        );
      if (work.phase !== "audit")
        return refuse(
          `the audit runs in the audit phase: ${work.id} is in ${work.phase} (crew phase ${work.id} next)`,
        );
      // The report (SP8 Task 5): rendered from the folder as it stands, unsigned until a person signs.
      if (args[1] === "report") return renderAudit(env, io, work, auditSignature(work));
      const only = typeof parsed.flags.only === "string" ? commaList(parsed.flags.only) : undefined;
      const unknown = only?.find((g) => !GATE_NAMES.includes(g as GateName));
      if (unknown !== undefined) return refuse(`unknown gate: ${unknown}`);
      // The profile follows the manifests before the tools run, as a gate run does (finding 23).
      const refreshed = refreshProfile(env.paths, env.profile, env.tampered);
      env.profile = refreshed.profile;
      const result = await runAudit(env.paths, work, env.profile, env.policy, {
        only: only as GateName[] | undefined,
      });
      if ("capped" in result) return refuse(cappedRefusal(result.capped));
      if ("stale" in result) return refuse(staleRefusal(work.id, result.stale));
      const scope = readJson<AuditScope>(join(workDir(env.paths, work.id), "audit", "scope.json"));
      const areas = scope?.riskAreas.length ? scope.riskAreas.join(", ") : "none";
      const text = [
        `audit run of ${work.id} at ${result.head ? result.head.slice(0, 12) : "no git"}:`,
        ...result.runs.map((r) => `  ${auditRunLine(r)}`),
        `files ${scope?.files ?? 0} (${scope?.bytes ?? 0} bytes), targets ${scope?.targets.length ?? 0}, risk areas: ${areas}`,
        `runs recorded in .crew/work/${work.id}/audit/runs.json; next: crew team ${work.id}, the roles over audit/files.txt (references/audit.md), then crew audit ${work.id} report`,
      ].join("\n");
      return ok(text, { runs: result, scope });
    }
    case "strategy": {
      // The strategy's check (SP7 §7.3, SP8 Task 3): the shape and the marks against the research as
      // it stands, then the review inputs the ruling is recorded against.
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened)) return opened;
      if (args[1] !== "check") return refuse("usage: crew strategy <id> check");
      const [plannedCheck] = plannedStrategyJudgement(opened.work);
      if (!plannedCheck)
        return refuse("strategy is not a phase of this item: a strategy belongs to a new project");
      const dir = workDir(env.paths, opened.work.id);
      const research = readText(join(dir, "conclave", "researcher.md"));
      if (research === null) return refuse(RESEARCHER_FIRST);
      const text = readText(join(dir, "strategy.md"));
      if (text === null) return refuse("strategy.md in the work folder (references/strategy.md)");
      const faults = checkStrategy(text, research, opened.work.knowledge?.listed ?? []);
      if (faults.length)
        return refuse(faults.map((f) => `strategy.md: ${f}`).join("\n"), { faults });
      const hash = strategyHash(text, research);
      const reviewer = plannedCheck.reviewer;
      writeProtectedJson(env.paths, join(dir, "review", "strategy", "inputs.json"), {
        at: nowIso(),
        hash,
        strategy: "strategy.md",
        researcher: "conclave/researcher.md",
        reviewer,
      });
      const parsedStrategy = parseStrategy(text);
      const claims = STRATEGY_SECTIONS.reduce((n, s) => n + parsedStrategy.bullets[s].length, 0);
      const rows = parsedStrategy.rows.length;
      const next =
        reviewer === "cto"
          ? "reviewer cto (full route): launch the CTO as reviewer of the strategy, then the judge"
          : "reviewer judge (standard route): launch the judge as judge of the strategy";
      return ok(
        `strategy ok: ${claims} claims marked, ${rows} scaling row${rows === 1 ? "" : "s"}; hash ${hash.slice(0, 12)}; ${next}`,
        { hash, reviewer, claims, rows },
      );
    }
    case "kind": {
      // A feature raised to a new project while its spec is open (SP7 §7.3, SP8 decision 2): the
      // lead's call, recorded as the agent's.
      const usage = 'usage: crew kind <id> raise --reason "<why>"';
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened)) return opened;
      const reason = typeof parsed.flags.reason === "string" ? parsed.flags.reason.trim() : "";
      if (args[1] !== "raise" || !reason) return refuse(usage);
      const raised = raiseKind(opened.work, reason);
      if (!raised.ok) return refuse(raised.reason);
      decide(env, opened.work.id, {
        kind: "kind",
        text: `kind raised to new-project: ${reason}`,
        by: "the agent",
      });
      saveWork(env.paths, opened.work);
      return ok(
        `${opened.work.id}: kind new-project (raised: ${reason})${raised.movedTo ? `; phase ${raised.movedTo}` : ""}`,
        { kind: "new-project", phase: opened.work.phase, movedTo: raised.movedTo },
      );
    }
    case "approve": {
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened)) return opened;
      if (args[1] !== "spec" && args[1] !== "audit")
        return refuse(
          "usage: crew approve <id> spec [--mode <mode> [--validator complete-gap-round]] | crew approve <id> audit",
        );
      const isAudit = kindOfItem(opened.work) === "audit";
      if (args[1] === "audit") {
        // An audit's report is signed by a person alone (SP7 §7.5, rule 19): no mode and no rule
        // records it as anyone else's; a refusal makes the item wait for one.
        if (!isAudit)
          return refuse(`only an audit is signed: ${opened.work.id} is ${kindLabel(opened.work)}`);
        if (parsed.flags.mode !== undefined || parsed.flags.validator !== undefined) {
          opened.work.awaiting = "user";
          delete opened.work.awaitingMessage;
          saveWork(env.paths, opened.work);
          return refuse(
            parsed.flags.validator !== undefined
              ? "an audit is never approved by the validator; the item waits for a person"
              : `an audit's report is signed by a person: run crew await ${opened.work.id} user and end the turn`,
          );
        }
        const signature = decisionFlag(parsed, env.policy);
        if (isOutcome(signature)) return signature;
        // The report signed is the report as it is: rendered, and current against its inputs (SP8 Task 5).
        const state = auditState(env.paths, opened.work);
        if (!state.report)
          return refuse(
            `the audit report comes before the signature (crew audit ${opened.work.id} report)`,
          );
        if (!state.reportCurrent)
          return refuse(
            `the audit report is stale: its inputs changed after it (crew audit ${opened.work.id} report)`,
          );
        approve(opened.work, "audit", signature);
        decide(env, opened.work.id, {
          kind: "approval",
          text: "audit signed",
          by: whoDecides(signature),
        });
        saveWork(env.paths, opened.work);
        // The three formats carry the signature line from here on.
        const rendered = await renderAudit(env, io, opened.work, auditSignature(opened.work));
        if (rendered.code !== 0) return rendered;
        return ok(
          `audit signed for ${opened.work.id} ${decisionText(env.policy, signature)}\n${rendered.text}`,
          { approvals: opened.work.approvals, ...rendered.data },
        );
      }
      if (isAudit)
        return refuse(`an audit is signed, not approved: crew approve ${opened.work.id} audit`);
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
      // A dispute Jev raised is held on the item until a person clears it (finding 94): the same
      // session cannot reshape the conclave and ask the rule again.
      const held = opened.work.validatorDispute;
      if (decision.by === "validator" && held)
        return refuse(
          `the validator's verdict was disputed by jev on ${held.at} (${held.condition}); a person clears it: crew resume ${opened.work.id} or crew approve ${opened.work.id} spec`,
        );
      let jevNote = "";
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
        // The rule asked of Jev (SP3 decision 10): a disputed condition makes the item wait for a
        // person (rule 15); verified or unverified, the approval proceeds and says which.
        const jev = jevConfig(io.env, env.config);
        if (jev.configured && askAllowed(env.policy, "validator")) {
          const dir = workDir(env.paths, opened.work.id);
          const evidence = loadEvidence(env.paths, opened.work.id).evidence;
          const outcome = await verifyValidator(jev, env.policy, {
            conclave: readText(join(dir, "conclave.md")) ?? "",
            decisions: (opened.work.decisions ?? []).map((d) => ({
              id: d.id,
              question: d.question,
              answer: d.answer ?? null,
              default: d.default ?? null,
            })),
            objections: loadLedger(env.paths, opened.work.id).ledger.objections.map((o) => ({
              id: o.id,
              severity: o.severity,
              status: objectionStatus(o, opened.work, evidence, env.policy),
              criterion: o.criterion ?? null,
            })),
          });
          appendVerifications(env, opened.work.id, outcome.records);
          if (outcome.status === "disputed") {
            opened.work.awaiting = "user";
            delete opened.work.awaitingMessage;
            opened.work.validatorDispute = {
              at: nowIso(),
              condition: outcome.condition ?? "the validator's rule",
              confidence: outcome.confidence ?? null,
            };
            saveWork(env.paths, opened.work);
            return refuse(
              `disputed by jev: ${outcome.condition} (${two(outcome.confidence ?? 0)}); the item waits for a person`,
            );
          }
          jevNote =
            outcome.status === "verified"
              ? " (verified by jev)"
              : ` (unverified: ${outcome.reason ?? "no reason"})`;
        }
      }
      // A person's approval stands above the rule Jev disputed: the dispute goes with it.
      if (decision.by === "user") delete opened.work.validatorDispute;
      approve(opened.work, "spec", decision);
      decide(env, opened.work.id, {
        kind: "approval",
        text: "spec approved",
        by: whoDecides(decision),
      });
      saveWork(env.paths, opened.work);
      return ok(
        `spec approved for ${opened.work.id} ${decisionText(env.policy, decision)}${jevNote}`,
        { approvals: opened.work.approvals },
      );
    }
    case "learn": {
      // The proven item enters the base (SP4 Task 4): the proof as it stands now is the ticket, or
      // the verdict its last gate run recorded, which the deliver guard required: an item past
      // deliver is no longer edited, so a later item's commit does not unprove it (finding 138).
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened)) return opened;
      const confirm = typeof parsed.flags.confirm === "string" ? parsed.flags.confirm : undefined;
      const current = assess(env.paths, opened.work, env.profile, env.policy, opened.tampered);
      const recorded = loadEvidence(env.paths, opened.work.id);
      const verdict =
        current.verdict === "proven" || recorded.tampered
          ? current.verdict
          : recorded.evidence.verdict;
      const outcome = learnItem(
        env.paths,
        opened.work,
        env.profile,
        env.policy,
        env.mail,
        verdict === "proven",
        { confirm },
      );
      if ("refused" in outcome) return refuse(outcome.refused);
      saveWork(env.paths, opened.work);
      // A learned item leaves the active slot (finding 136's second half): the next start takes it.
      updateState(env.paths, (state) => {
        if (state.active === opened.work.id) state.active = null;
      });
      const ids = outcome.entries.map((e) => e.id).join(", ") || "none";
      decide(env, opened.work.id, {
        kind: "knowledge",
        text: learnedText(
          outcome.entries.map((e) => e.id),
          outcome.confirmed,
        ),
        by: "the agent",
      });
      const lines = [
        ...outcome.entries.map((e) => `${e.id} · ${e.kind} · "${e.title}"`),
        ...(outcome.confirmed.length ? [`confirmed ${outcome.confirmed.join(", ")}`] : []),
        ...outcome.skipped.map((s) => `skipped ${s}`),
        ...outcome.notices.map((n) =>
          n.refused ? `notice to ${n.to} refused: ${n.refused}` : `notice ${n.id} to ${n.to}`,
        ),
      ];
      const text = [lines.join("\n") || "learned none", ...laneEnd(env, opened.work)].join("\n");
      return ok(text, { learned: opened.work.learned, ...outcome });
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
      return awaitCommand(env, args);
    case "resume":
      return resumeCommand(env, parsed, args);
    case "research":
      return researchCommand(env, parsed, args, io);
    case "analyse": {
      // Where the defect came from (SP7 §7.4, rule 11): git and the records, written to the item.
      const usage = "usage: crew analyse <id> --paths <file,file>";
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened)) return opened;
      const list = commaList(parsed.flags.paths);
      if (!list.length) return refuse(usage);
      const origin = analyseOrigin(env.paths, list);
      if ("refused" in origin) return refuse(origin.refused);
      // Rule 17 (SP4 Task 5): the base's root causes on these paths, read apart and uncapped, go
      // into the record; the item's knowledge.md is rewritten with the paths in its query.
      const originPaths = origin.paths.map((p) => p.path);
      const read = readBase(env.paths.userDir);
      origin.knownRootCauses = read.base
        ? knownRootCauses(read.base, scopeOf(env.paths, env.mail.self), originPaths)
        : [];
      writeOrigin(env.paths, opened.work.id, origin);
      await lookupForItem(env, opened.work, io.env, { paths: originPaths, base: read });
      saveWork(env.paths, opened.work);
      const data = { file: "analysis/origin.json", origin };
      if (origin.note)
        return ok(
          "no git repository: origin.json written empty; write analysis.md from what you can read",
          data,
        );
      const known = origin.knownRootCauses.length
        ? `\nknown root causes: ${origin.knownRootCauses
            .map((k) => `${k.id} "${k.title}" (${k.paths.join(", ")})`)
            .join("; ")}`
        : "";
      return ok(`analysis/origin.json: ${originSummary(origin)}${known}`, data);
    }
    case "question": {
      // A doubt on record (SP7 §10.3, rule 7): where it was posted, what the skill still posts, the
      // wait it sets, and the person's answer that clears it.
      const usage =
        'usage: crew question <id> add "<text>" [--mode <mode>] | posted Q-n --channel cli|ticket|document|mail --ref <ref> | answer Q-n "<answer>" [--mode <mode>] | list';
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened)) return opened;
      const work = opened.work;
      const verb = args[1];
      if (verb === "list") {
        const sorted = questionsSorted(work);
        return ok(sorted.length ? sorted.map(questionLine).join("\n") : "no questions", {
          questions: sorted.map(questionJson),
        });
      }
      if (verb === "add") {
        const text = args.slice(2).join(" ").trim();
        if (!text) return refuse(usage);
        // Without --mode a person is present (the hook demands the flag where nobody watches).
        const decided = decisionFlag(parsed, env.policy);
        if (isOutcome(decided)) return decided;
        const question = addQuestion(
          work,
          text,
          questionChannels(work, {
            personPresent: decided.by === "user",
            workspace: env.mail.self.workspace,
          }),
        );
        const notes = postQuestionChannels(env, work, question, text);
        // The wait is the user wait crew await sets: a doubt is a person's to answer, whatever
        // the item waited for before.
        const was = waitingPhrase(work);
        work.awaiting = "user";
        delete work.awaitingMessage;
        saveWork(env.paths, work);
        moveOriginMail(env, work, "blocked", notes);
        const toPost = channelList(question.channels, false).length > 0;
        const line = `${question.id} recorded; waiting for the user${was && was !== "waiting for the user" ? ` (was ${was})` : ""}; ${channelsText(question)}${toPost ? `: crew question ${work.id} posted ${question.id} --channel <channel> --ref <ref>` : ""}`;
        return ok(notes.length ? `${line}\n${notes.join("\n")}` : line, {
          question: questionJson(question),
          awaiting: "user",
          notes,
        });
      }
      if (verb === "posted") {
        const id = args[2];
        const kind = parsed.flags.channel;
        const ref = parsed.flags.ref;
        if (!id || !isQuestionChannelKind(kind) || typeof ref !== "string" || !ref.trim())
          return refuse(usage);
        const marked = markPosted(work, id, kind, ref.trim());
        if ("refused" in marked) return refuse(marked.refused);
        saveWork(env.paths, work);
        return ok(`${id} posted to ${kind} (${ref.trim()})`, { question: questionJson(marked) });
      }
      if (verb === "answer") {
        const id = args[2];
        const text = args.slice(3).join(" ");
        if (!id || !text.trim()) return refuse(usage);
        // A person's decision (SP7 §10.3): with nobody present the doubt keeps waiting.
        const decided = decisionFlag(parsed, env.policy);
        if (isOutcome(decided)) return decided;
        if (decided.by !== "user")
          return refuse(`a question is answered by a person; the item waits (${id})`);
        const by = whoDecides(decided);
        const answered = answerQuestion(work, id, text, by);
        if ("refused" in answered) return refuse(answered.refused);
        decide(env, work.id, {
          at: answered.answeredAt,
          kind: "question",
          id,
          text: answered.text,
          answer: answered.answer,
          by,
        });
        // The user wait clears when no question is open; another wait is not the question's to clear.
        const notes: string[] = [];
        const open = openQuestions(work);
        let tail: string;
        let resumed = false;
        if (open.length) tail = `${open.map((q) => q.id).join(", ")} still open, the item waits`;
        else if (work.awaiting === "user") {
          work.awaiting = null;
          delete work.awaitingMessage;
          resumed = true;
          tail = "the item goes on";
        } else if (work.awaiting) tail = `the item keeps ${waitingPhrase(work)}`;
        else tail = "the item was not waiting";
        saveWork(env.paths, work);
        if (resumed) moveOriginMail(env, work, "in-progress", notes);
        const line = `${id} answered by the user; ${tail}`;
        return ok(notes.length ? `${line}\n${notes.join("\n")}` : line, {
          question: questionJson(answered),
          awaiting: work.awaiting,
        });
      }
      return refuse(usage);
    }
    case "tdd":
      return tddCommand(env, parsed, args);
    case "gate": {
      const opened = openForChange(env, args[1]);
      if (isOutcome(opened)) return opened;
      if (args[0] !== "run") return refuse("usage: crew gate run <id> [--only a,b]");
      const only = typeof parsed.flags.only === "string" ? commaList(parsed.flags.only) : undefined;
      const unknown = only?.find(
        (g) => !GATE_NAMES.includes(g as GateName) && !isJudgementGateName(g),
      );
      if (unknown !== undefined) return refuse(`unknown gate: ${unknown}`);
      // The profile follows the manifests before the gates are planned: a script or a lockfile the
      // work added is picked up here, with no detect --refresh and no profile set (finding 23).
      const refreshed = refreshProfile(env.paths, env.profile, env.tampered);
      env.profile = refreshed.profile;
      const outcome = await withRunning(
        env.paths,
        opened.work.id,
        env.session,
        `crew gate run ${opened.work.id}`,
        () =>
          runGates(env.paths, opened.work, env.profile, env.policy, {
            only: only as (GateName | JudgementGateName)[] | undefined,
            tampered: env.tampered || opened.tampered,
          }),
      );
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
      const review = outcome.review ? rel(env.paths, outcome.review) : null;
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
      // The judge's launch line carries the answers the session filed (SP6 Task 4, decision 10).
      const filedBySession = sessionFiledLine(outcome.evidence.roles ?? []);
      const judgementNote = pending.length
        ? `\nJudgement gates to run: ${pending.map((r) => `${r.gate} (${r.planned})`).join(", ")}; inputs in ${review}/ (diff.patch, files.txt); record each with crew judgement ${opened.work.id} record --ruling <file>${filedBySession ? `\n${filedBySession}` : ""}`
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
      // A strategy ruling (SP8 Task 3) is recorded on its own path: against the hash of the two
      // files, never the code's fingerprint, and in its own rounds.
      const strategyGate = rulingGates(env, parsed, args[2]);
      if (strategyGate.includes("strategy")) {
        if (strategyGate.length !== 1)
          return refuse(
            "a strategy ruling is recorded on its own: one ruling with gate strategy and no other",
          );
        return recordStrategyJudgement(env, opened, parsed, args[2], usage);
      }
      // A todo's ruling goes into the todo's gate (SP7b decision 14), never into the item's rounds.
      if (parsed.flags.task !== undefined) {
        if (typeof parsed.flags.task !== "string" || !/^T-\d+$/.test(parsed.flags.task))
          return refuse("usage: crew judgement <id> record --task T-n --ruling <file>");
        return recordTaskJudgement(
          env,
          io.env,
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
      // The upheld defects asked of Jev (SP3 decision 10) before the save: the marks go on the
      // findings, the answers on the evidence; unavailable marks and records nothing.
      const defects = await askDefects(
        env,
        io.env,
        records,
        join(reviewDir(env.paths, opened.work.id), "diff.patch"),
      );
      // The rulings go into the evidence as it stands at the save, under the lock (finding 81), the
      // verdict is computed on it, and the file is written once, with the verdict: no reader sees
      // new records beside a stale verdict (review of SP2b, finding 8). A record that proves the
      // work delivers it; a refused save (the file edited outside the engine, a lock held) records nothing.
      const saved = updateEvidence(env.paths, opened.work.id, (fresh) => {
        for (const record of records) recordJudgement(fresh, record);
        if (defects?.records.length)
          fresh.verifications = [...(fresh.verifications ?? []), ...defects.records];
        const merged = reassess({ ...before, evidence: fresh }, opened.work, env.policy);
        fresh.verdict = merged.verdict;
        fresh.unproven = merged.unproven;
        return merged;
      });
      if ("refused" in saved) return refuse(saved.refused);
      const result = saved.result;
      // Jev down on a full-route item: the item waits for a person after the record (decision 12).
      const jevWait = jevUnavailableWait(opened.work, defects);
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
          ? rel(env.paths, resolve(env.paths.root, parsed.flags.ruling))
          : undefined;
      for (const fields of rulingDecisions(records, rulingFile))
        decide(env, opened.work.id, fields);
      deliver(env, opened, result.evidence);
      const lines = records.flatMap((r) => {
        const outside = r.findings.filter((f) => f.outside).length;
        const detail =
          r.verdict === "not-run"
            ? `: ${r.reason}`
            : ` (${findingsText(r.findings.length)}${outside ? `, ${outside} outside the change` : ""})`;
        return [`  ${r.gate}: ${verdictWord(r.verdict)}${detail}`, ...markLines(r)];
      });
      lines.push(
        result.verdict === "proven"
          ? `Proven: ${opened.work.id}`
          : `Not proven: ${result.unproven.join("; ")}`,
      );
      // The answers the session filed, said with the verdict (SP6 Task 4, decision 10).
      const filedBySession = sessionFiledLine(before.evidence.roles ?? []);
      if (filedBySession) lines.push(filedBySession);
      if (jevWait) lines.push(jevWait);
      // Like gate run: the exit code says whether the work is proven, so a chain stops at "Not proven".
      return {
        code: result.verdict === "proven" ? 0 : 1,
        stdout: true,
        text: lines.join("\n"),
        data: { records, verdict: result.verdict, unproven: result.unproven },
      };
    }
    case "abandon": {
      // An item the user drops is closed on their word (finding 124): recorded as their decision,
      // taken out of the live lists, read-only from then on; nothing is deleted.
      const opened = openUntampered(env, args[0]);
      if (isOutcome(opened)) return opened;
      const reason = typeof parsed.flags.reason === "string" ? parsed.flags.reason.trim() : "";
      if (!reason) return refuse('usage: crew abandon <id> --reason "<why>"');
      const work = opened.work;
      if (work.abandoned) return refuse(abandonedLine(work.id, work.abandoned));
      if (work.phase === "learn") return refuse(`${work.id} is learned: nothing to abandon`);
      const decision = decisionFlag(parsed, env.policy);
      if (isOutcome(decision)) return decision;
      work.abandoned = { at: nowIso(), reason, by: decision };
      saveWork(env.paths, work);
      const state = loadState(env.paths);
      if (state.active === work.id) {
        state.active = null;
        saveState(env.paths, state);
      }
      decide(env, work.id, {
        at: work.abandoned.at,
        kind: "abandon",
        text: `abandoned: ${reason}`,
        by: whoDecides(decision),
      });
      return ok(`abandoned ${work.id} ${decisionText(env.policy, decision)}: ${reason}`, {
        abandoned: work.abandoned,
      });
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
        'usage: crew task <id> open T-n --criteria AC-1,AC-2 [--text "<task text>"] | note T-n --criteria AC-k --scope <path>[,<path>] [--text "<todo>"] | list | merge T-n [--force] | drop T-n | gate T-n [--scope <path>[,<path>]] | brief T-n';
      const ctx = env.mail;
      if (args[1] === "open") {
        const task = args[2];
        const criteria = commaList(parsed.flags.criteria);
        // A word after the task's id is refused, not ignored (finding 114).
        if (!task || !criteria.length || args.length > 3) return refuse(usage);
        // A part's todo is noted inline, never handed to an implementer (finding 61).
        if (parsed.flags.part !== undefined)
          return refuse(
            "crew task open takes no part: a part's todo is noted inline (crew task <id> note T-n --part P-k)",
          );
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
        // worktree and its branch (crew task drop removes them, the user's decision): the line says what to do.
        const session =
          "failed" in out.opened
            ? `the implementer ${out.opened.stopped ? "was started and stopped" : "did not start"}: ${out.opened.failed}; the task keeps its record, the worktree ${out.record.worktree} and the branch ${out.record.branch}: open the implementer by hand there (a session opened by hand is watched by no sweep and no merge check), or drop them with crew task ${opened.work.id} drop ${task}`
            : `implementer started (${out.opened.name}, pid ${out.opened.pid}, ${out.opened.maxTurns} turns, ${minutesText(out.opened.maxMinutes)})`;
        return ok(
          `${task} opened: message ${out.message.id}, worktree ${out.record.worktree}, branch ${out.record.branch}; ${session}${out.notes.length ? `\n${out.notes.join("\n")}` : ""}`,
          { task: out.record, message: out.message, opened: out.opened, notes: out.notes },
        );
      }
      if (args[1] === "note") {
        // A todo the lead does inline (SP7 §8.1): no worktree, no message; its scope names its files.
        const task = args[2];
        const criteria = commaList(parsed.flags.criteria);
        const scope = commaList(parsed.flags.scope);
        if (!task || !criteria.length || args.length > 3) return refuse(usage);
        const planText = readText(join(workDir(env.paths, opened.work.id), "plan.md"));
        const part = typeof parsed.flags.part === "string" ? parsed.flags.part : null;
        // The todo's text: --text, else the plan's line n, else its part's text (finding 61).
        const out = noteTask(opened.work, task, {
          criteria,
          scope,
          text:
            typeof parsed.flags.text === "string" ? parsed.flags.text : taskText(planText, task),
          plan: planText,
          part,
        });
        if ("refused" in out) return refuse(out.refused);
        saveWork(env.paths, opened.work);
        return ok(`${task} noted: inline, ${criteria.join(",")}, scope ${scope.join(",")}`, {
          task: out.record,
        });
      }
      if (args[1] === "gate") {
        // The todo's own gate on the files it touched (SP7 §8.1), bounded by team.maxGateRounds.
        const task = args[2];
        if (!task) return refuse(usage);
        const record = findTask(opened.work, task);
        if ("refused" in record) return refuse(record.refused);
        return taskGate(env, opened, parsed, record);
      }
      if (args[1] === "brief") {
        // What the todo changed, proved and left, from the records (SP7 §8.1); the leads read it at delivery.
        const task = args[2];
        if (!task) return refuse(usage);
        const record = findTask(opened.work, task);
        if ("refused" in record) return refuse(record.refused);
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
      if (args[1] === "drop") {
        // An unmerged task removed (finding 30): the user's decision, taken as every user-only command is.
        const task = args[2];
        if (!task || args.length > 3) return refuse(usage);
        const decision = decisionFlag(parsed, env.policy);
        if (isOutcome(decision)) return decision;
        const out = dropTask(ctx, env, opened.work, task);
        if ("refused" in out) return refuse(out.refused);
        decide(env, opened.work.id, {
          kind: "task",
          text: `dropped ${task}: branch ${out.record.branch} at ${out.tip}`,
          by: whoDecides(decision),
        });
        return ok(
          `${out.swept.length ? `${out.swept.join("\n")}\n` : ""}dropped ${task} of ${opened.work.id} ${decisionText(env.policy, decision)}: worktree ${out.record.worktree} and branch ${out.record.branch} (at ${out.tip.slice(0, 7)}) removed, message ${out.record.message} refused${out.notes.length ? `\n${out.notes.join("\n")}` : ""}`,
          { task: out.record, tip: out.tip, swept: out.swept },
        );
      }
      if (args[1] === "merge") {
        if (!args[2] || args.length > 3) return refuse(usage);
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
      if (args[1] === "seat") return seatJudgement(env, parsed, opened, args.slice(2));
      const changed = changedWatchedPaths(env.paths.root, env.profile, opened.work);
      // An audit's seats follow its scope (SP8 Task 4): the scope written by the run, the item's
      // own risk areas before it; the route plans nothing on an audit.
      const audit = kindOfItem(opened.work) === "audit";
      const scope = audit
        ? readJson<AuditScope>(join(workDir(env.paths, opened.work.id), "audit", "scope.json"))
        : null;
      // The registry a pack's template may have widened (SP6 Task 2 AC-4), and the knowledge files
      // the expert reads for these paths (AC-5): both said here and recorded as the packs the item used.
      const registry = teamsFor(env.policy, packTemplates(env.paths.userDir));
      const seats = audit
        ? auditSeats({ riskAreas: scope?.riskAreas ?? opened.work.riskAreas }, env.policy)
        : plannedSeats(opened.work.route, opened.work.riskAreas, changed, env.policy, {
            strategy: phasesFor(opened.work).includes("strategy"),
            registry: registry.teams,
            templatePaths: changedPaths(env.paths.root, opened.work),
          });
      const primary = primaryTeam(changed);
      opened.work.seats = seats;
      opened.work.primaryTeam = primary;
      const served = audit
        ? { paths: [], packs: [], skipped: [] }
        : recordPackUse(opened.work, {
            userDir: env.paths.userDir,
            profile: env.profile,
            changed,
            policy: env.policy,
            registry: registry.teams,
          });
      saveWork(env.paths, opened.work);
      const listed = seats.map((s) => `${s.role} (${s.reason})`).join("; ");
      const text = audit
        ? `Team of ${opened.work.id} (audit): ${listed}`
        : seats.length
          ? `Team of ${opened.work.id} (primary ${primary}): ${listed}`
          : `Team of ${opened.work.id}: no seat (fast route)`;
      const extra = [
        registry.warning ??
          (env.policy.team.template !== "core"
            ? `template: ${env.policy.team.template} (pack)`
            : null),
        served.paths.length ? `knowledge for the expert: ${served.paths.join(", ")}` : null,
      ].filter((l): l is string => l !== null);
      return ok([text, ...extra].join("\n"), {
        seats,
        primaryTeam: primary,
        template: env.policy.team.template,
        warning: registry.warning,
        knowledge: served.paths,
        packs: opened.work.packs ?? [],
      });
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
      const dir = workDir(env.paths, work.id);
      // The record's file lives with the item, so the evidence outlives the session (item D,
      // finding 132): its real path, links followed, must be inside the item's folder.
      const text = readText(path);
      if (text === null) return refuse(`no validation file at ${path}`);
      if (!insideFolder(realOrSelf(path), realOrSelf(dir)))
        return refuse(`the validation file must be inside .crew/work/${work.id}/: ${file}`);
      // The heading of the block the verdict is read from names the item, the subject and the
      // team; an answer for another of them is not this validation (finding 132: a spec answer
      // recorded as the delivery's). A file with no lead heading cannot be told apart.
      const name = relative(dir, path).replace(/\\/g, "/");
      const asked = `asked: the ${what} by ${by} for ${work.id}`;
      const heading = leadHeading(text);
      if (!heading)
        return refuse(
          `${name} has no lead heading (# <team> lead's validation of ${work.id}: <spec|plan|delivery>); ${asked}`,
        );
      if (heading.item !== work.id || heading.what !== what || `lead-${heading.team}` !== by)
        return refuse(
          `${name} is the ${heading.team} lead's ${heading.what} answer for ${heading.item}; ${asked}`,
        );
      const verdict = parseValidation(text);
      if ("refused" in verdict) return refuse(verdict.refused);
      // A file whose content this lead's record already holds, under any subject, is an earlier
      // answer, whatever the spec's revision (finding 119; any subject since item D, finding 132):
      // refused, naming the record it is and the file a resumed lead's new answer lands in. A
      // record without the hash (an older item) tells nothing apart and is read as before.
      const contentHash = fileHash(text);
      const repeated = (work.validations ?? []).find(
        (v) => v.by === by && v.fileHash === contentHash,
      );
      if (repeated)
        return refuse(
          `already recorded: ${repeated.file} is the answer recorded for round ${repeated.round} of ${by} (${repeated.what}); record the lead's new answer (a resumed lead's lands in ${replyFile(by, what)})`,
        );
      const evidence = loadEvidence(env.paths, work.id).evidence;
      const hash = validationHash(
        what,
        readText(join(dir, "spec.md")),
        readText(join(dir, "plan.md")),
        evidence.fingerprint ?? "",
      );
      // The round this record counts in, one counter per subject (validation.ts); a new spec round
      // past the cap waits for the user's continuation.
      const rounds = work.rounds ?? { judgement: 0, validation: 0 };
      const { round, newRound } = validationRound(
        work.validations ?? [],
        what,
        by,
        hash,
        rounds.validation,
      );
      if (what === "spec" && newRound) {
        const held = continueOrRefuse(
          env,
          work,
          "validation",
          undefined,
          env.policy.team.maxValidationRounds,
          round - 1,
          `validation round ${round} of ${work.id}: the policy allows ${env.policy.team.maxValidationRounds} (team.maxValidationRounds); the user continues it once with crew continue ${work.id} validation, or decides`,
        );
        if (held) return held;
      }
      work.validations = [
        ...(work.validations ?? []),
        {
          what,
          by,
          verdict: verdict.verdict,
          returns: verdict.returns,
          round,
          file: name,
          hash,
          fileHash: contentHash,
          at: nowIso(),
        },
      ];
      if (what === "spec" && newRound)
        work.rounds = { ...rounds, validation: Math.max(rounds.validation, round) };
      saveWork(env.paths, work);
      // A return is a decision of the lead about the item (SP7 §6.6); a validated verdict is the plan's own record.
      const recorded = work.validations[work.validations.length - 1];
      if (verdict.verdict === "returned" && recorded)
        decide(env, work.id, {
          at: recorded.at,
          kind: "validation",
          text: `${what} returned by ${by}: ${verdict.returns} return${verdict.returns === 1 ? "" : "s"}`,
          by,
          file: recorded.file,
        });
      const said =
        verdict.verdict === "validated"
          ? `validated (round ${round})`
          : `returned, ${verdict.returns} return${verdict.returns === 1 ? "" : "s"} (round ${round})`;
      const filedLine = sessionFiledLine(loadEvidence(env.paths, work.id).evidence.roles ?? []);
      return ok(`validation of ${what} by ${by}: ${said}${filedLine ? `\n${filedLine}` : ""}`, {
        validation: work.validations[work.validations.length - 1],
        rounds: work.rounds ?? rounds,
      });
    }
    case "metrics": {
      // The figures of this project, or of every registered project of a workspace (SP7 §6.5), from
      // the records alone; the CTO reads them, never a transcript.
      const ws = typeof parsed.flags.workspace === "string" ? parsed.flags.workspace : null;
      const computed = workspaceFigures(env, ws);
      if (!computed)
        return refuse(`no project of workspace ${ws} is registered (crew detect in each project)`);
      return ok(metricsText(computed.metrics), { ...computed.metrics });
    }
    case "knowledge": {
      // The knowledge base's commands (SP4 Task 2, ADR 0009): what a person adds, reads, disputes
      // or, alone, unmarks; the engine's kinds enter at Learn. Rule 13 is `visibleTo`, read first.
      const usage = `usage: crew knowledge <id> lookup | list [--kind <k>] | show K-n | add --kind general|documentation --title "<t>" --file <path> [--source <url>] | contradict K-n --reason "<why>" [--item <id>] | unmark K-n | ${LESSON_ARGS}`;
      const sub = args[0];
      if (args[1] === "lookup") {
        // The base read again for an item (SP4 Task 3): after a kind raise, after an entry entered.
        const opened = openForChange(env, sub);
        if (isOutcome(opened)) return opened;
        const text = await lookupForItem(env, opened.work, io.env);
        saveWork(env.paths, opened.work);
        return ok(text, { knowledge: opened.work.knowledge });
      }
      const scope = scopeOf(env.paths, env.mail.self);
      const read = readBase(env.paths.userDir);
      const unreadable = read.base === null && read.reason !== "missing" ? read.reason : null;
      const visible = (id: string): KnowledgeEntry | null =>
        read.base?.entries.find((e) => e.id === id && visibleTo(e, scope)) ?? null;
      // A hidden entry and an unknown id answer alike: the base says nothing about what a project cannot read.
      const unseen = (id: string) => refuse(`no entry ${id} visible to this project`);
      const register = (text: string, by: string) =>
        decide(env, "knowledge", { kind: "knowledge", text, by });
      const kindFlag = parsed.flags.kind;
      if (sub === "list") {
        if (kindFlag !== undefined && !KNOWLEDGE_KINDS.includes(kindFlag as KnowledgeKind))
          return refuse(`unknown kind ${String(kindFlag)}: one of ${KNOWLEDGE_KINDS.join(", ")}`);
        // A harness lesson is listed when asked for by its kind alone (ADR 0013, AC-2).
        const entries = (read.base?.entries ?? []).filter(
          (e) =>
            visibleTo(e, scope) &&
            (kindFlag === undefined ? e.kind !== HARNESS_LESSON : e.kind === kindFlag),
        );
        const text = entries.length
          ? entries.map(entryLine).join("\n")
          : unreadable
            ? `none (the knowledge base cannot be read: ${unreadable})`
            : "none";
        return ok(text, { entries, ...(unreadable ? { unreadable } : {}) });
      }
      if (sub === "show") {
        const id = args[1];
        if (id === undefined) return refuse(usage);
        if (unreadable) return refuse(`the knowledge base cannot be read: ${unreadable}`);
        const entry = visible(id);
        if (!entry) return unseen(id);
        return ok(entryText(entry), { entry });
      }
      if (sub === "add") {
        const title = parsed.flags.title;
        const file = parsed.flags.file;
        const source = parsed.flags.source;
        if (typeof kindFlag !== "string" || typeof file !== "string" || title === undefined)
          return refuse(usage);
        if (!KNOWLEDGE_KINDS.includes(kindFlag as KnowledgeKind))
          return refuse(`unknown kind ${kindFlag}: one of ${KNOWLEDGE_KINDS.join(", ")}`);
        const kind = kindFlag as KnowledgeKind;
        if (kind === HARNESS_LESSON)
          return refuse(`${kind} entries are written by crew knowledge lesson add`);
        if (!USER_KINDS.includes(kind)) return refuse(`${kind} entries are written by crew learn`);
        if (typeof title !== "string" || !title.trim())
          return refuse("a knowledge entry needs a title");
        // A title leaves the machine with the lookup's ask (SP4 Task 3): a secret in it is refused here.
        const titled = scanText(title, "title")[0];
        if (titled) return refuse(`the title holds a secret (${titled.rule}); nothing was written`);
        // The file comes from the project's own tree (the security lead's R-3): a `..`, an absolute
        // path or a symlink that leaves it is refused, and a secret in it never enters the base.
        const real = fileInsideRoot(env.paths.root, file);
        if (real === null) return refuse(`no file at ${file}`);
        if (real === "")
          return refuse(
            `${file} is outside the project (a knowledge entry is read from the project's own tree)`,
          );
        const text = readText(real) ?? "";
        const finding = scanText(text, file)[0];
        if (finding)
          return refuse(
            `${file}:${finding.line} holds a secret (${finding.rule}); nothing was written`,
          );
        const added = addEntry(env.paths.userDir, {
          kind,
          title: title.trim(),
          workspace: scope.workspace,
          project: scope.project,
          projectRoot: scope.projectRoot,
          confidential: defaultConfidential(kind),
          item: null,
          commit: null,
          stacks: [],
          paths: [],
          words: words(`${title} ${text}`),
          text,
          source: typeof source === "string" ? source : null,
        });
        if ("refused" in added) return refuse(added.refused);
        register(`knowledge add ${added.id}: ${added.title}`, "the agent");
        return ok(
          `${added.id} added (${kind}, marked for ${scope.workspace ?? "this project"}): ${added.title}`,
          { entry: added },
        );
      }
      if (sub === "lesson") {
        // The improvement loop's lesson about the crew (ADR 0013, AC-17): its run's record as the
        // evidence, read from this repository's own docs/improve/, never from another tree.
        const { cue, lesson, evidence, proposal, confidence } = parsed.flags;
        if (
          args[1] !== "add" ||
          typeof cue !== "string" ||
          typeof lesson !== "string" ||
          typeof evidence !== "string" ||
          typeof proposal !== "string" ||
          typeof confidence !== "string"
        )
          return refuse(`usage: crew knowledge ${LESSON_ARGS}`);
        if (unreadable) return refuse(`the knowledge base cannot be read: ${unreadable}`);
        const drafted = harnessLesson(env.paths.root, {
          cue,
          lesson,
          evidence,
          proposal,
          confidence,
        });
        if ("refused" in drafted) return refuse(drafted.refused);
        const secret = scanText(`${drafted.cue}\n${drafted.lesson}`, "lesson")[0];
        if (secret)
          return refuse(`the lesson holds a secret (${secret.rule}); nothing was written`);
        const added = addEntry(env.paths.userDir, {
          kind: HARNESS_LESSON,
          title: drafted.cue,
          workspace: scope.workspace,
          project: scope.project,
          projectRoot: scope.projectRoot,
          confidential: false,
          item: null,
          commit: null,
          stacks: [],
          paths: [],
          words: words(`${drafted.cue} ${drafted.lesson}`),
          text: drafted.lesson,
          source: drafted.evidence,
          harness: drafted.mark,
        });
        if ("refused" in added) return refuse(added.refused);
        register(`knowledge lesson ${added.id}: ${added.title}`, "the agent");
        return ok(
          `${added.id} added (harness-lesson, ${drafted.mark.proposal}, confidence ${drafted.mark.confidence}): ${added.title}`,
          { entry: added },
        );
      }
      if (sub === "contradict") {
        const id = args[1];
        const reason = parsed.flags.reason;
        const item = parsed.flags.item;
        if (id === undefined || typeof reason !== "string" || !reason.trim()) return refuse(usage);
        if (unreadable) return refuse(`the knowledge base cannot be read: ${unreadable}`);
        if (!visible(id)) return unseen(id);
        // No item named: the ref says so with null, never a sentinel (SP6 Task 1 AC-3).
        const ref = {
          item: typeof item === "string" ? item : null,
          project: scope.project,
          at: nowIso(),
          reason: reason.trim(),
        };
        const changed = updateEntry(env.paths.userDir, id, (e) => {
          e.contradictedBy.push(ref);
        });
        if ("refused" in changed) return refuse(changed.refused);
        register(`knowledge contradict ${id}: ${ref.reason}`, "the agent");
        return ok(
          `${id} contradicted${ref.item === null ? "" : ` by ${ref.item}`}: ${ref.reason}`,
          {
            entry: changed,
          },
        );
      }
      if (sub === "unmark") {
        const id = args[1];
        if (id === undefined) return refuse(usage);
        // A mark leaves a client's entry readable everywhere: a person's decision alone, no mode
        // and no rule records it as anyone else's (rule 13, ADR 0009); the hook denies the rest.
        if (parsed.flags.validator !== undefined)
          return refuse("a mark is never removed by the validator");
        if (parsed.flags.mode !== undefined)
          return refuse("a mark is removed by a person: run the command without --mode");
        if (unreadable) return refuse(`the knowledge base cannot be read: ${unreadable}`);
        const entry = visible(id);
        if (!entry) return unseen(id);
        if (entry.confidential === false) return refuse(`${id} is not marked`);
        const by =
          env.policy.attendedDecisions === "relay" ? "the user, relayed by the agent" : "the user";
        const changed = updateEntry(env.paths.userDir, id, (e) => {
          e.confidential = false;
        });
        if ("refused" in changed) return refuse(changed.refused);
        register(`knowledge unmark ${id}: ${entry.title}`, by);
        return ok(`${id} unmarked by ${by}: ${entry.title} is read in every workspace`, {
          entry: changed,
        });
      }
      return refuse(usage);
    }
    case "answer": {
      // A role's answer filed by the session (SP6 Task 4 AC-5), where the runtime the item ran
      // under files none by hook: the same filing as the SubagentStop hook's, marked as the session's.
      const usage = "usage: crew answer file <id> --role <role> --file <path> [--as <agent>]";
      if (args[0] !== "file") return refuse(usage);
      const role = typeof parsed.flags.role === "string" ? parsed.flags.role : "";
      const file = typeof parsed.flags.file === "string" ? parsed.flags.file : "";
      const as = typeof parsed.flags.as === "string" ? parsed.flags.as : undefined;
      if (!role || !file) return refuse(usage);
      const opened = openForChange(env, args[1]);
      if (isOutcome(opened)) return opened;
      const work = opened.work;
      if (work.phase === "learn") return refuse(`${work.id} is not open (phase ${work.phase})`);
      if (!ROLE_NAMES.includes(role))
        return refuse(`unknown role ${role} (one of: ${ROLE_NAMES.join(", ")})`);
      if (!existsSync(file)) return refuse(`no file at ${file}`);
      const observed = work.runtimes?.length ? work.runtimes : ["claude"];
      const byHook = observed.filter((n) =>
        runtimeOf(n)?.guarantees.some(
          (g) => g.what === "the roles' answers filed" && g.tier === "enforced",
        ),
      );
      if (byHook.length === observed.length)
        return refuse(
          `${work.id} ran under ${observed.join(" and ")}, which files the roles' answers by its subagent hook: resume the role or save its answer from the transcript`,
        );
      const ctx = buildContext({ session_id: "crew-answer", cwd: env.paths.root }, io.env);
      if (!ctx) return refuse("crew is inactive here");
      try {
        // The file's text as the role's answer; the filing adds the final newline the hook adds.
        const done = fileAnswerBySession(ctx, work.id, role, {
          answer: readFileSync(file, "utf8").replace(/\n$/, ""),
          ...(as ? { as } : {}),
        });
        const lines = [
          `${done.agent}'s answer filed as ${done.file ?? "no file"} (by the session); a role wait is cleared with crew resume ${work.id}`,
        ];
        if (done.note) lines.push(done.note);
        return ok(lines.join("\n"), { agent: done.agent, file: done.file });
      } catch (error) {
        return refuse((error as Error).message);
      }
    }
    case "runtime": {
      // The runtime adapters (SP6 Task 4 AC-3): the table listed, a runtime's hook configuration
      // merged in, the skill copied as crew-method and the agents generated under crew names, and
      // the configuration read back with one result per event, the copies' hashes and the table.
      const [sub, name] = args;
      const usage =
        "usage: crew runtime list | install <name> [--scope project|user] | remove <name> [--scope project|user] | check <name> [--scope project|user]";
      if (sub === "list") return ok(listLines().join("\n"), { runtimes: [...RUNTIME_NAMES] });
      if (sub !== "install" && sub !== "remove" && sub !== "check") return refuse(usage);
      const runtime = runtimeOf(name ?? "");
      if (!runtime) return refuse(`unknown runtime ${name ?? ""} (crew runtime list)`);
      const scopeFlag = parsed.flags.scope;
      if (scopeFlag !== undefined && scopeFlag !== "project" && scopeFlag !== "user")
        return refuse(usage);
      const scope = scopeFlag as Scope | undefined;
      const dirs = { project: env.paths.root, home: io.env.HOME ?? "" };
      const root = pluginRoot();
      if (sub === "install") {
        if (runtime.name === "claude")
          return refuse(
            "claude is installed as a plugin (claude plugin install wizardingcode-developer-crew@wizardingcode-plugins)",
          );
        const done = installRuntime(runtime, scope ?? "project", dirs, root);
        if ("refused" in done) return refuse(done.refused);
        const lines = [...done.files, ...(done.trust ? [`trust: ${done.trust}`] : [])];
        return ok(lines.join("\n"), { files: done.files, trust: done.trust });
      }
      if (sub === "remove") {
        // The rollback (judgement round 2): crew's entries out of the merged configuration, the
        // foreign ones kept; crew's own files gone; every path printed.
        if (runtime.name === "claude")
          return refuse(
            "claude is installed as a plugin (claude plugin uninstall wizardingcode-developer-crew@wizardingcode-plugins)",
          );
        const done = removeRuntime(runtime, scope ?? "project", dirs);
        if ("refused" in done) return refuse(done.refused);
        const lines = [
          ...done.rewritten.map((p) => `rewritten ${p}`),
          ...done.removed.map((p) => `removed ${p}`),
        ];
        return ok(
          lines.length
            ? lines.join("\n")
            : `nothing of crew's installed for ${runtime.name} at ${scope ?? "project"} scope`,
          { rewritten: done.rewritten, removed: done.removed },
        );
      }
      const checked = checkRuntime(runtime, scope ?? null, dirs, root);
      return {
        code: checked.ok ? 0 : 1,
        text: checked.lines.join("\n"),
        stdout: true,
        data: { lines: checked.lines, ok: checked.ok },
      };
    }
    case "pack": {
      // The packs the engine serves (SP6 Task 2, ADR 0010): registered from a path or by Claude
      // Code's discovery, checked whole, listed with their states, their files served by path.
      const usage =
        "usage: crew pack add <path> | remove <name> | list | show <name> | files checklists <kind> | files knowledge <key> | files knowledge --item <id> | sync";
      const sub = args[0];
      const userDir = env.paths.userDir;
      const register = (text: string) =>
        decide(env, "pack", {
          kind: "pack",
          text,
          by: "the agent",
        });
      const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
      if (sub === "add") {
        const path = args[1];
        if (path === undefined) return refuse(usage);
        const added = registerPack(userDir, resolve(env.paths.root, path), "command");
        if ("refused" in added) return refuse(added.refused);
        const m = added.manifest;
        const lines = [
          `${added.name} ${added.version} registered (${m.kind}): ${plural(m.checklists.length, "checklist")}, ${plural(Object.keys(m.knowledge).length, "knowledge file")}, ${plural(m.detectors.length, "detector rule")}, template ${m.team?.template ?? "none"}`,
        ];
        // A pack's command is proposed until a person confirms it in each project (AC-3): said at the add.
        for (const rule of m.detectors)
          for (const [gate, command] of Object.entries(rule.gates))
            lines.push(
              `  ${rule.stack}: ${gate} "${command}" (proposed until crew profile confirm ${gate} in each project it applies to)`,
            );
        for (const rule of m.detectors)
          if (rule.testScoped)
            lines.push(
              `  ${rule.stack}: scoped test "${rule.testScoped}" (proposed until crew profile confirm test in each project it applies to)`,
            );
        register(`pack add ${added.name} ${added.version}`);
        return ok(lines.join("\n"), { registration: added });
      }
      if (sub === "remove") {
        const name = args[1];
        if (name === undefined) return refuse(usage);
        const out = removePack(userDir, name);
        if ("refused" in out) return refuse(out.refused);
        register(`pack remove ${name}`);
        return ok(`${name} removed`, { removed: name });
      }
      if (sub === "list") {
        const listed = listPacks(userDir);
        if (!listed.length) return ok("no pack registered (crew pack add <path>)", { packs: [] });
        return ok(
          listed
            .map(
              (p) =>
                `${p.name} ${p.registration?.version ?? "?"} · ${p.registration?.manifest.kind ?? "?"} · ${p.registration?.root ?? "?"} · ${stateText(p.state)}`,
            )
            .join("\n"),
          { packs: packsJson(listed) },
        );
      }
      if (sub === "show") {
        const name = args[1];
        if (name === undefined) return refuse(usage);
        const listing = listPacks(userDir).find((p) => p.name === name);
        if (!listing) return refuse(`no pack ${name} is registered (crew pack list)`);
        if (!listing.registration) return refuse(`${name}: ${stateText(listing.state)}`);
        const r = listing.registration;
        const m = r.manifest;
        const lines = [
          `${r.name} ${r.version} · ${m.kind} · ${stateText(listing.state)}`,
          `root: ${r.root}`,
          `registered: ${r.registeredAt} by ${r.by}`,
          `core: ${m.core} · verified against: ${Object.entries(m.verifiedAgainst)
            .map(([k, v]) => `${k} ${v}`)
            .join(", ")}`,
          `detectors: ${
            m.detectors.length
              ? m.detectors
                  .map(
                    (d) =>
                      `${d.stack}${d.extends ? ` extends ${d.extends}` : ""} (${Object.entries(
                        d.gates,
                      )
                        .map(([g, c]) => `${g} "${c}"`)
                        .join(", ")})`,
                  )
                  .join("; ")
              : "none"
          }`,
          `checklists: ${m.checklists.map((p) => basename(p, ".md")).join(", ") || "none"}`,
          `knowledge: ${Object.keys(m.knowledge).join(", ") || "none"}`,
          `template: ${
            m.team
              ? `${m.team.template} (${Object.entries(m.team.teams)
                  .map(([t, d]) => `${t}: ${d.mandatory.globs.join(", ")}`)
                  .join("; ")})`
              : "none"
          }`,
          `evals: ${m.evals.join(", ") || "none"}`,
          `provenance: ${m.provenance.length ? plural(m.provenance.length, "source") : "none"}`,
        ];
        return ok(lines.join("\n"), { registration: r, state: stateText(listing.state) });
      }
      if (sub === "files") {
        const kind = args[1];
        const item = parsed.flags.item;
        if (kind === "knowledge" && typeof item === "string") {
          // The expert's knowledge files for an item (AC-5), recorded as the packs it used.
          const opened = openForChange(env, item);
          if (isOutcome(opened)) return opened;
          const changed = changedWatchedPaths(env.paths.root, env.profile, opened.work);
          const served = knowledgeFilesFor(userDir, env.profile, changed, env.policy);
          const listed = listPacks(userDir);
          recordPacks(
            opened.work,
            served.packs.map((n) => packLabel(listed, n)),
          );
          saveWork(env.paths, opened.work);
          for (const skipped of served.skipped) io.stderr(`no knowledge file: ${skipped}\n`);
          return ok(served.paths.join("\n"), {
            paths: served.paths,
            packs: opened.work.packs ?? [],
            skipped: served.skipped,
          });
        }
        const key = args[2];
        if ((kind !== "checklists" && kind !== "knowledge") || key === undefined)
          return refuse(usage);
        const paths = packFiles(userDir, kind, key);
        return ok(paths.join("\n"), { paths });
      }
      if (sub === "sync") {
        const lines = discoverPacks(userDir, io.env);
        register(`pack sync: ${lines.length ? lines.join("; ") : "nothing changed"}`);
        return ok(lines.length ? lines.join("\n") : "nothing changed", { changes: lines });
      }
      return refuse(usage);
    }
    case "cto": {
      // The CTO's review and plan (SP7 §6.5, SP4 Task 5): the inputs the engine writes from the
      // records and the base, and the plan filed per workspace and entered in the base, marked.
      const usage =
        "usage: crew cto review --workspace <ws> | crew cto record --workspace <ws> --file <plan.md>";
      const verb = args[0];
      const ws = parsed.flags.workspace;
      if ((verb !== "review" && verb !== "record") || typeof ws !== "string") return refuse(usage);
      // The workspace names a folder under the user's crew directory: the same name rule as the
      // mail's workspace, so nothing reaches outside it (code-quality review, round 1).
      if (!MAIL_NAME.test(ws)) return refuse(`a workspace is ${NAME_HINT}, not ${ws}`);
      // The project's own workspace alone (the security lead's return at the spec): no other
      // workspace's figures or rows are read or written from here, and no other is named.
      const own = env.mail.self.workspace;
      if (own === null)
        return refuse("this project is in no workspace (crew policy set mail.workspace <name>)");
      if (ws !== own)
        return refuse(`this project is in workspace ${own}: crew cto ${verb} --workspace ${own}`);
      const scope = scopeOf(env.paths, env.mail.self);
      const dir = ctoDir(env.paths.userDir, ws);
      const date = nowIso().slice(0, 10);
      if (verb === "review") {
        const computed = workspaceFigures(env, ws);
        if (!computed)
          return refuse(
            `no project of workspace ${ws} is registered (crew detect in each project)`,
          );
        const { metrics, figures: knowledge } = computed;
        const lastPlan = latestPlan(env.paths.userDir, ws);
        // A second review the same day goes beside the first, never over it (finding 160), so each
        // plan can be tied to the inputs it was written from.
        const inputs = {
          at: nowIso(),
          workspace: ws,
          metrics,
          lastPlan,
          knowledge,
          harnessLessons: lessonsForCto(readBase(env.paths.userDir).base, scope),
        };
        const target = createFreeFile(dir, `${date}-inputs`, ".json", jsonText(inputs));
        // The figures the inputs carry are printed too, so the session and its trace hold what the
        // CTO reads (the CTO case's fourth run: the agent alone saw them, inside its own context).
        return ok(
          [
            `inputs: ${target}`,
            ...metricsText(metrics).split("\n"),
            `last plan: ${lastPlan?.path ?? "none"}`,
            `launch wizardingcode-developer-crew:cto with the inputs path and the reports of the items it counts; file the plan with crew cto record --workspace ${ws} --file <plan.md> --inputs ${target}. The review item's criterion has no test: open it with crew start "<request>" --answers '<json>' --observed "<the plan filed>", record it once the plan is filed with crew tdd observed <id> AC-1 --reason "a plan, not code" -- "<a command that reads the filed plan>", then crew gate run <id>`,
          ].join("\n"),
          { path: target, lastPlan, knowledge },
        );
      }
      // The record: the plan's file, narrowed here where it is read.
      const file = parsed.flags.file;
      if (typeof file !== "string") return refuse(usage);
      const path = resolve(env.paths.root, file);
      const text = readText(path);
      if (text === null) return refuse(`no plan file at ${path}`);
      const title = `CTO plan ${date} (${ws})`;
      // The whole plan and the title through the scanner before any cut and before the file (the
      // security lead's return at the spec): a secret leaves no file and no entry.
      const finding = scanText(text, "plan")[0] ?? scanText(title, "title")[0];
      if (finding)
        return refuse(
          `the plan holds a secret (${finding.rule}) at line ${finding.line}; nothing was filed`,
        );
      const read = readBase(env.paths.userDir);
      if (read.base === null && read.reason !== "missing")
        return refuse(`the knowledge base cannot be read: ${read.reason}; nothing was filed`);
      // The inputs the plan was written from, checked before anything is written (finding 160):
      // without --inputs the plan is filed alone, never tied to a guessed file.
      const inputsFlag = parsed.flags.inputs;
      let inputs: string | null = null;
      if (typeof inputsFlag === "string") {
        const given = resolve(env.paths.root, inputsFlag);
        if (!existsSync(given)) return refuse(`no inputs file at ${given}; nothing was filed`);
        const real = ctoInputsFile(dir, given);
        if (real === null)
          return refuse(
            `${given} is not an inputs file of workspace ${ws} (crew cto review writes <date>-inputs[-<n>].json in its CTO folder); nothing was filed`,
          );
        inputs = readTextQuietly(real);
        if (inputs === null) return refuse(`${given} cannot be read; nothing was filed`);
      }
      // A second plan the same day goes beside the first, never over it (finding 53).
      // The plan and the copy of its inputs as a set: never a plan without its copy, nothing over
      // a file another writer holds (2026-10-25-002); with no copy, its name is still held free, so
      // a file already there is never read as this plan's inputs (2026-10-25-003).
      const target = createFreeFiles(dir, `${date}-plan`, [
        [".md", text],
        [PLAN_INPUTS_EXT, inputs],
      ]);
      const copy = planInputsPath(target);
      const added = addEntry(env.paths.userDir, {
        kind: "general",
        title,
        workspace: scope.workspace,
        project: scope.project,
        projectRoot: scope.projectRoot,
        confidential: defaultConfidential("general"),
        item: null,
        commit: null,
        stacks: [],
        paths: [],
        words: words(`${title} ${text}`),
        text,
        source: target,
      });
      if ("refused" in added) return refuse(added.refused);
      return ok(
        `CTO plan of ${ws} filed: ${target}\nentry ${added.id}: general, marked for ${ws}\ninputs: ${inputs === null ? "none" : copy}`,
        { path: target, entry: added, inputs: inputs === null ? null : copy },
      );
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
      decide(env, opened.work.id, {
        kind: "continue",
        text: `${what} continued for one more round`,
        by: whoDecides(decision),
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
          const { hash, ...state } = signed;
          const digest = `sha256:${hash.replace(/^sha256:/, "").slice(0, 12)}`;
          decide(env, "workspace", {
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
        return ok(prioritiesLine(state), { workspace, ...state });
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
          `  ${p.name} (${p.root}): ${p.gone ? "gone" : p.live ? "live" : "not live"} · items ${p.items} · unread ${p.unread} · threads ${p.threads} open · priorities ${p.priorities} unconfirmed · questions ${p.questions} open · environment ${p.environment}`,
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
      // With an id any item is read, an abandoned one included (finding 124); with none, the active one.
      const named = args[0] ? openWork(env, args[0]) : null;
      if (named && isOutcome(named)) return named;
      const active = named ?? activeWork(env.paths);
      if (!active?.work) return ok("no active work item", { active: null });
      return statusView(env, { work: active.work, tampered: active.tampered });
    }
    case "mail":
      return mailCommand(env, parsed, args);
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

const ENVIRONMENT_KEYS = [...ENVIRONMENT_COMMANDS, "logs", "url", "timeout"] as const;
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
      key === "mode"
        ? config.mode
        : key === "decisions.log"
          ? config.decisions.log
          : key === "jev.endpoint"
            ? (config.jev?.endpoint ?? JEV_ENDPOINT)
            : key === "jev.model"
              ? (config.jev?.model ?? JEV_MODEL)
              : undefined;
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
  policy set <key> <value> [--remove]   attendedDecisions prompt|relay, unattendedDecisions wait|count|validator, mail.workspace|name|open|maxConcurrent|maxHops|maxTurns|maxMinutes|maxParties|worktrees, riskPathExclusions "<glob>" (one glob added; --remove takes it out) (asks the user)
  accept <id|profile|policy>            trust state changed outside the engine (asks the user)
  start "<request>" --answers <json>    create a work item from the typed answers
      [--criterion "<text>"] [--preserve "<text>"] [--observed "<text>"]   criteria, repeatable; preserve: existing tests stay green; observed: no test can fail first (a plan, a document)
      [--origin <message id>]           the item answers a message of this project's inbox (a session opened by mail)
      [--priority blocker|high|normal|low]   the item's priority; else its origin's confirmed one, else normal
  classify <id> --answers <json>        record typed answers and compute the route
  analyse <id> --paths <file,file>      an issue's origin from git and the records, written to analysis/origin.json (before Understand)
  criteria <id> add "<text>" [--kind preserve|observed] [--contract <mid>:<n>]   a criterion, bound to a contract of a reply in the item's mail when given
  criteria <id> remove <AC-n>           take out a criterion no test-first record or skip names
  criteria <id> supersede <AC-n> --by <AC-m>   AC-m's text replaces AC-n's: the report shows both, the verdict reads AC-m, AC-n's records stay (a kind at least as strict; no objection left on AC-n)
  abandon <id> --reason "<why>"         close an item the user drops: their decision on record; the item leaves the open items and the active slot, nothing changes it again, every file stays readable (asks the user)
  decision <id> add "<question>" [--default "<answer>"]   a decision only the user can make (gap round)
  decide <id> D-n "<answer>"            record the user's answer (asks the user)
      --mode <mode> --validator stated-default   no person watching: the validator takes the default
  objection <id> add "<text>" --by <role> --severity blocking|advisory   file an objection (ledger)
  objection <id> resolve O-n --criterion AC-k   resolved when that criterion is proven
  objection <id> waive O-n --reason "<why>"     the user decides against it (asks the user)
  debate <id> open --reason "<why>"     the conclave's debate opens on a decision with consequences (once per item)
  debate <id> close [--tokens n]        the judge has ruled; plan is held while the debate is open
  research <id> verify [--file <path>]  check the researcher's quotes in their sources; ask Jev when configured
  approve <id> spec                     record the user's approval (asks the user)
      --mode auto|bypassPermissions|dontAsk   no person watching: recorded as the agent's decision
  approve <id> audit                    a person signs an audit's report (asks the user; never with --mode or --validator)
  kind <id> raise --reason "<why>"      a feature raised to a new project while its spec is open: the strategy comes next
  strategy <id> check                   check strategy.md (the five sections, [R<n>] marks on the research's facts, the scaling table) and write the strategy's review inputs
  audit <id> run [--only a,b]           run the project's own tools over the whole tree with no baseline (an audit item in its audit phase), every result recorded, the files the reviewers read and the scope beside them
  audit <id> report                     render the audit's report from the findings (every one proof-checked): Markdown, HTML under the brand, the PDF by the project's Playwright or a browser or its reason; crew approve <id> audit signs it
  phase <id> next                       advance when the guard holds
  await <id> user | role | mail <mid>   mark the turn's wait: for the user, for the roles, or for a reply to a message
  resume <id>                           clear the wait (asks the user while a jev dispute is held on the item)
  question <id> add "<text>" [--mode m] | posted Q-n --channel <c> --ref <r> | answer Q-n "<answer>" | list   a doubt on record, posted where it can; answered by a person (asks the user)
  mail send --to <project|.> --type question|change-request|notice|blocker "<text>"   send mail inside the workspace
      [--priority blocker|high|normal|low] [--thread <root>] [--agent <session|T-n|role>] [--item <id>] [--reply-to <mid>] [--subject <text>] [--file <path>]
  mail inbox [--all] | read <mid> | thread <mid> | reply <mid> "<text>" [--branch <b>] [--item <child>] [--contract <kind>:<path>[:<summary>]]… [--as <role>] [--file <path>]
  mail accept <mid> [--priority <p>] [--reason "<why>"]   confirm a request's priority, or lower it with a reason (never raise)
  mail refuse <mid> --reason "<why>" | status | stop <mid>   this project's mail and the sessions it opened (status sweeps them; stop kills one)
  workspace status [--json]           every project of the workspace: live, open items, unread, open threads, unconfirmed priorities, environment (reads records, runs nothing)
  workspace priorities [accept [--file <path>]]   the workspace's signed business priorities (accept asks the user)
  task <id> open T-n --criteria AC-1,AC-2 [--text "<task text>"]   hand a task of the plan to an implementer: a message, a worktree, a branch, a session
  task <id> list | merge T-n [--force]   the tasks and their children; merge a proven child's branch (--force merges an unproven one: asks the user)
  task <id> drop T-n                    remove an unmerged task whose implementer is not running: its worktree, its branch, its record; its message refused (asks the user)
  tdd <red|green|before|after|observed> <id> <criterion> [--reason "<why>"] [-- <cmd>]
  gate run <id> [--only a,b]            run the gates the route requires; plans the judgement gates and writes their inputs to .crew/work/<id>/review/
  judgement <id> record --ruling <file>  record the rulings of a review file ({"rulings":[{gate,verdict,reviewer,judge,findings,tokens}]}); exit 0 once proven
  judgement <id> record <gate> --not-run --reason "<why>"   a judgement gate that could not run, never passed by default
  team <id>                   the seats the route plans for the item, with their reasons, recorded
  team <id> seat <gate> --reason "<why>"  seat a judgement gate the route did not plan (the agent's addition, on the register)
  validation <id> record --what spec|plan|delivery --by lead-<team> --file <path>   a lead's verdict from its file; a contradiction is refused
  continue <id> judgement|validation|gate T-n   one more round past the policy's cap (the user's decision)
  decisions [--grep <text>]   the project's decision register, newest first; --grep matches the id, the text and the answer, in any case
  metrics [--workspace <ws>]  the figures of this project, or of the workspace's registered projects, from the records and the base
  cto review --workspace <ws>          write the CTO's inputs (the workspace's metrics, the last plan, the base's figures and rows) under the user's crew directory and print the launch line; open the review item first, with --observed "<the plan filed>" (references/learn.md)
  cto record --workspace <ws> --file <plan.md> [--inputs <file>]   file the CTO's plan under the user's crew directory and enter it in the knowledge base, marked for the workspace; --inputs (the file crew cto review named) is filed beside it as <plan>${PLAN_INPUTS_EXT}, what ties the plan to what it was written from
  knowledge list [--kind <k>] | show K-n   the knowledge base as this project reads it (rule 13: unmarked entries, and marked ones of this workspace)
  knowledge add --kind general|documentation --title "<t>" --file <path> [--source <url>]   a person's material, from the project's own tree, marked
  knowledge lesson add --cue "<t>" --lesson "<t>" --evidence docs/improve/<run>/record.json --proposal P-n --confidence high|medium|low   the improvement loop's lesson about the crew, its run's record as evidence; read in this repository alone (ADR 0013)
  knowledge contradict K-n --reason "<why>" [--item <id>]   dispute an entry (recorded); knowledge unmark K-n   a person removes a mark (asks the user; never with --mode or --validator)
  learn <id> [--confirm K-n]           the proven item enters the base (in the learn phase): its solution, an issue's root cause, the facts with a source, the workspace's stack preference; what it cited is confirmed; a root cause the base holds is refused unless confirmed
  pack add <path> | remove <name> | list | show <name> | files checklists <kind> | files knowledge <key> | files knowledge --item <id> | sync   the packs the engine serves (references/packs.md)
  runtime list | install <name> [--scope project|user] | remove <name> [--scope project|user] | check <name> [--scope project|user]   the runtime adapters: the table, a runtime's hook configuration merged in with the skill and the agents, crew's entries and files taken out again, and the configuration read back with the guarantee table (references/runtimes.md)
  skip <id> <step> --reason "<text>"    record a skip of a tdd step, a gate or a judgement gate (asks the user; --mode as for approve)
  evidence <id>                         write and print the report
  status | mode [m] | config <key> [v]  state and settings
  --json on any command prints the machine form`;

/** The arguments of `crew knowledge lesson add` (ADR 0013), in the command's usage and in its own refusal. */
const LESSON_ARGS =
  'lesson add --cue "<t>" --lesson "<t>" --evidence docs/improve/<run>/record.json --proposal P-n --confidence high|medium|low';

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
    // The runtime's answer on stdout with its exit code; a refusal (an unknown runtime) on stderr,
    // so no runtime reads it as its JSON (Gemini forbids plain text on stdout).
    if (outcome.code === 0 || outcome.stdout) io.stdout(`${outcome.text}\n`);
    else io.stderr(`${outcome.text}\n`);
    return outcome.code;
  }
  if (parsed.flags.json)
    io.stdout(
      `${JSON.stringify({ ok: outcome.code === 0, message: outcome.text, ...outcome.data })}\n`,
    );
  else if (outcome.code === 0 || outcome.stdout) {
    // A command with nothing to print (crew pack files with no file) prints nothing, not a blank line.
    if (outcome.text) io.stdout(`${outcome.text}\n`);
  } else io.stderr(`${outcome.text}\n`);
  return outcome.code;
}
