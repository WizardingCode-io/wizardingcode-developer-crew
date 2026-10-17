import { existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { type Parsed, parse } from "./argv.ts";
import { AnswerError, type Answers, computeRoute, validateAnswers } from "./classify.ts";
import { loadConfig, saveConfig, setConfigValue } from "./config.ts";
import { detectProfile, missingTestCommands } from "./detect/index.ts";
import {
  countedNote,
  decidedBy,
  loadEvidence,
  renderReport,
  saveEvidence,
  tddSummary,
} from "./evidence.ts";
import { changedWatchedPaths, hashPaths, isGitRepo } from "./fingerprint.ts";
import { ensureDir, nowIso, readText, writeText } from "./fs.ts";
import { assess, reassess, runGates } from "./gates.ts";
import { handleHook } from "./hooks/index.ts";
import type { HookPayload } from "./hooks/types.ts";
import {
  contradiction,
  fillTokens,
  judgementRows,
  notRunRecord,
  parseRulings,
  plannedNote,
  readReviewInputs,
  recordJudgement,
  stampRuling,
} from "./judgement.ts";
import {
  emptyInboxSummary,
  inboxSummary,
  loadItemMail,
  type MailContext,
  mailContext,
  markRead,
  ownInbox,
  pruneRegistry,
  readOpenSessions,
  recordInItem,
  refuseMail,
  registerProject,
  reply as replyMail,
  send,
  syncMail,
  TASK_AGENT,
  tamperedBox,
  updateStatusEverywhere,
  worktreeMainRoot,
} from "./mail.ts";
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
import { type CrewPaths, PROTECTED_WORK_FILES, resolvePaths, userDirOf, workDir } from "./paths.ts";
import {
  decisionCounts,
  loadPolicy,
  SETTABLE_POLICY_KEYS,
  setPolicyValue,
  skipAllowed,
} from "./policy.ts";
import { ensureProfile, loadProfile, refreshProfile, saveProfile } from "./profile.ts";
import { ensureCrewDir } from "./state.ts";
import { integrityOf, recordIntegrity, writeProtectedText } from "./store.ts";
import { listTasks, mergeTask, openTask, takeReplies } from "./tasks.ts";
import { recordTdd, type TddStep } from "./tdd.ts";
import { plannedSeats, primaryTeam } from "./team.ts";
import type {
  Decision,
  Evidence,
  GateName,
  JudgementGateName,
  JudgementRecord,
  OpenedSession,
  Phase,
  Policy,
  Profile,
  ProjectEntry,
  Stack,
  UserConfig,
  WorkItem,
} from "./types.ts";
import {
  GATE_NAMES,
  isJudgementGateName,
  isMailType,
  isPermissionMode,
  isValidatorRule,
  JUDGEMENT_GATES,
  PERMISSION_MODES,
  PHASE_ORDER,
  partyLabel,
  VALIDATOR_RULES,
} from "./types.ts";
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
  loadWork,
  nextPhaseOf,
  openDebate,
  openItems,
  PHASES_BY_ROUTE,
  removeCriterion,
  saveWork,
  validatorPreconditions,
  waitingText,
} from "./work.ts";

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
  start: ["answers", "criterion", "preserve", "origin"],
  classify: ["answers"],
  criteria: ["kind"],
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
  judgement: ["ruling", "not-run", "reason"],
  skip: ["reason", "mode"],
  evidence: [],
  status: [],
  task: ["criteria", "text", "force", "mode"],
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
  if (target === "profile" || target === "policy") {
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

function guardContext(env: Env, work: WorkItem, tampered: boolean): GuardContext {
  const dir = workDir(env.paths, work.id);
  const result = assess(env.paths, work, env.profile, env.policy, env.tampered || tampered);
  return {
    specText: readText(join(dir, "spec.md")),
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

function logDecision(env: Env, work: WorkItem, answers: Answers): void {
  if (!env.config.decisions.log) return;
  const line = JSON.stringify({
    at: nowIso(),
    work: work.id,
    input: work.input.slice(0, 500),
    answers,
    route: work.route,
    reasons: work.routeReasons,
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

function classify(env: Env, work: WorkItem, answers: Answers): void {
  const decision = computeRoute(answers, [], env.policy);
  applyClassification(work, answers.work_type, decision);
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
      if (sub === "set") {
        if (!GATE_NAMES.includes(gate as GateName) || gate === "secrets" || !cmd)
          return refuse(
            'usage: crew profile set <build|test|lint|typecheck|deps> "<cmd>" [--target <path>]',
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
        return ok(`policy ${key}: ${value}`, result);
      }
      return refuse("usage: crew policy accept | crew policy set <key> <value>");
    }
    case "accept": {
      if (!args[0]) return refuse("usage: crew accept <id|profile|policy>");
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
      const work = createWork(env.paths, input, baseFiles);
      if (neighbours.length)
        work.sharedCheckout = { with: neighbours, paths: uncommitted, at: work.createdAt };
      const sharedWarning = neighbours.length
        ? `warning: this checkout is shared with ${neighbours.join(", ")}, which ${neighbours.length === 1 ? "is" : "are"} open with uncommitted changes in ${uncommitted.join(", ")}; a second session on one checkout blocks turn ends and proves half-written code: work in a worktree (git worktree add ../<name> -b <branch>)\n`
        : "";
      classify(env, work, answers);
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
      const originNotes: string[] = [];
      if (origin) {
        // The message is read, and the new item keeps its copy as it now stands.
        const read = markRead(env.mail, origin.id, originNotes);
        recordInItem(env.paths, work.id, "refused" in read ? origin : read);
      }
      const lines = criteria.map((c) => `\n  ${c.id} (${c.kind}): ${c.text}`).join("");
      return ok(
        `${warning}${sharedWarning}${inheritedWarning}${provenNote}started ${work.id} (route ${work.route}: ${work.routeReasons.join("; ")})${lines}${originNotes.length ? `\n${originNotes.join("\n")}` : ""}`,
        {
          id: work.id,
          route: work.route,
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
      classify(env, opened.work, answers);
      saveWork(env.paths, opened.work);
      return ok(
        `${opened.work.id}: route ${opened.work.route} (${opened.work.routeReasons.join("; ")})`,
        { id: opened.work.id, route: opened.work.route, riskAreas: opened.work.riskAreas },
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
      const criterion = addCriterion(opened.work, text, kind);
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
        if (ownInbox(env.mail).messages.some((m) => m.id === openedBy))
          updateStatusEverywhere(env.mail, openedBy, "waiting-for-person", undefined, notes);
        return refuse(
          `a full-route item opened by mail (${openedBy}) waits for a person at its spec; the item is marked waiting for the user and the message waiting-for-person${notes.length ? `; ${notes.join("; ")}` : ""}`,
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
      if (command === "resume") {
        opened.work.awaiting = null;
        delete opened.work.awaitingMessage;
        saveWork(env.paths, opened.work);
        return ok(`${opened.work.id}: resumed`, { awaiting: null, awaitingMessage: null });
      }
      // The three waits a turn may end on (SP2c §9): the user, the roles, a reply to a message.
      const kind = args[1];
      if (kind !== "user" && kind !== "role" && kind !== "mail") return refuse(usage);
      if (kind === "mail" && !args[2]) return refuse(usage);
      opened.work.awaiting = kind;
      if (kind === "mail") opened.work.awaitingMessage = args[2];
      else delete opened.work.awaitingMessage;
      saveWork(env.paths, opened.work);
      return ok(`${opened.work.id}: ${waitingText(opened.work).slice(2)}`, {
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
      if (outcome.ok) saveEvidence(env.paths, opened.work.id, evidence);
      const tail = outcome.record?.tail ? `\n${outcome.record.tail}` : "";
      return outcome.ok
        ? ok(outcome.message, { record: outcome.record })
        : refuse(`${outcome.message}${tail}`, { record: outcome.record });
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
      return {
        code: outcome.verdict === "proven" ? 0 : 1,
        stdout: true,
        text:
          picked +
          raised +
          gateSummary(opened.work, outcome.verdict, outcome.unproven, outcome.evidence.runs) +
          judgementNote +
          reviewLine,
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
      const grants = (opened.work.continued ?? []).filter(
        (c) => c.what === "judgement" && decisionCounts(env.policy, c.by),
      ).length;
      if (newRound && rounds.judgement >= env.policy.team.maxJudgementRounds + grants)
        return refuse(
          `judgement round ${rounds.judgement + 1} of ${opened.work.id}: the policy allows ${env.policy.team.maxJudgementRounds} (team.maxJudgementRounds); the user continues it once with crew continue ${opened.work.id} judgement, or decides (crew skip <id> gate:<gate> where policy.json allows it)`,
        );
      const records: JudgementRecord[] = [];
      // One or the other: a gate that could not run has no ruling file to record (review of SP2b, finding 11).
      if (parsed.flags["not-run"] && typeof parsed.flags.ruling === "string")
        return refuse(
          "--not-run and --ruling do not go together: a gate that could not run has no ruling; give one or the other",
        );
      if (parsed.flags["not-run"]) {
        const gate = args[2];
        const reason = typeof parsed.flags.reason === "string" ? parsed.flags.reason.trim() : "";
        if (!gate || !reason) return refuse(usage);
        if (!isJudgementGateName(gate))
          return refuse(`unknown judgement gate: ${gate} (${JUDGEMENT_GATES.join(", ")})`);
        if (!planned.includes(gate))
          return refuse(`${gate} is not planned for this item${plannedNote(planned)}`);
        records.push(notRunRecord(gate, reason, before.currentFingerprint));
      } else {
        if (typeof parsed.flags.ruling !== "string") return refuse(usage);
        // A ruling is about the inputs the judge saw: none, or inputs cut from other code, and the
        // file cannot be recorded against the code as it is now (review of SP2b, finding 1).
        const inputs = readReviewInputs(env.paths, opened.work.id);
        if (!inputs)
          return refuse(
            `no review inputs for this item: run crew gate run ${opened.work.id} first, then the reviewers and the judge`,
          );
        if (inputs.fingerprint !== before.currentFingerprint)
          return refuse(
            `the review inputs describe other code than the current one: run crew gate run ${opened.work.id}, then the reviewers and the judge again`,
          );
        // A relative path is from the repository root, like every path the skill names (D-1 of
        // the SP2b minors, 2026-10-15); the refusal prints the path as resolved, so a path given
        // from a subfolder is refused for where it was looked for (review of SP2b, finding 6).
        const rulingPath = resolve(env.paths.root, parsed.flags.ruling);
        const text = readText(rulingPath);
        if (text === null) return refuse(`no ruling file at ${rulingPath}`);
        let raw: unknown;
        try {
          raw = JSON.parse(text);
        } catch {
          return refuse(`the ruling file is not valid JSON: ${rulingPath}`);
        }
        const parsedRulings = parseRulings(raw, planned);
        if ("refused" in parsedRulings) return refuse(parsedRulings.refused);
        for (const ruling of parsedRulings.rulings)
          records.push(
            stampRuling(ruling, before.currentFingerprint, before.changed, opened.work.id),
          );
      }
      // Checked once every record is stamped (a defect is inside or outside the change only then),
      // and before anything is recorded: one contradiction refuses the whole command. Every record
      // goes through it, a not-run one too (review of item 2026-10-15-001, advisory).
      for (const record of records) {
        const why = contradiction(record);
        if (why) return refuse(why);
      }
      fillTokens(
        records,
        before.evidence.roles ?? [],
        readReviewInputs(env.paths, opened.work.id)?.at,
      );
      // The rulings go into the evidence the assessment read, the verdict is computed on it, and
      // the file is written once, with the verdict: no reader sees new records beside a stale
      // verdict (review of SP2b, finding 8). A record that proves the work delivers it.
      for (const record of records) recordJudgement(before.evidence, record);
      const result = reassess(before, opened.work, env.policy);
      result.evidence.verdict = result.verdict;
      result.evidence.unproven = result.unproven;
      saveEvidence(env.paths, opened.work.id, result.evidence);
      // The round spent, counted at the first record against this code (plan decision 3 of SP7a).
      if (newRound)
        opened.work.rounds = {
          ...rounds,
          judgement: rounds.judgement + 1,
          judgementCode: before.currentFingerprint,
        };
      saveWork(env.paths, opened.work);
      deliver(env, opened, result.evidence);
      const lines = records.map((r) => {
        const outside = r.findings.filter((f) => f.outside).length;
        const detail =
          r.verdict === "not-run"
            ? `: ${r.reason}`
            : ` (${r.findings.length} finding${r.findings.length === 1 ? "" : "s"}${outside ? `, ${outside} outside the change` : ""})`;
        const word =
          r.verdict === "not-proven"
            ? "not proven"
            : r.verdict === "not-run"
              ? "not run"
              : "proven";
        return `  ${r.gate}: ${word}${detail}`;
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
      saveEvidence(env.paths, opened.work.id, result.evidence);
      writeProtectedText(env.paths, join(workDir(env.paths, opened.work.id), "report.md"), report);
      return ok(report, { verdict: result.verdict, unproven: result.unproven });
    }
    case "task": {
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened)) return opened;
      const usage =
        'usage: crew task <id> open T-n --criteria AC-1,AC-2 [--text "<task text>"] | list | merge T-n [--force]';
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
        const lines = rows.map(
          ({ task: t, status, verdict, implementer }) =>
            `  ${t.task} · ${t.criteria.join(",")} · ${t.branch} · ${t.message} ${status} · ${t.child ?? "no child yet"} · ${verdict}${implementer ? ` · ${implementer}` : ""}${t.mergedAt ? ` · merged ${t.mergeCommit?.slice(0, 7)}` : ""}`,
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
      const subject =
        what === "gate" ? `gate of ${task} of ${opened.work.id}` : `${what} of ${opened.work.id}`;
      return ok(`${subject} continued for one more round ${decisionText(env.policy, decision)}`, {
        continued: opened.work.continued,
      });
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
      const text = `${active.work.id} "${active.work.title}"\n  phase ${active.work.phase}, route ${active.work.route}${waitingText(active.work)}\n${gateSummary(active.work, result.verdict, result.unproven, result.evidence.runs)}`;
      const work = active.work;
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
      const notes = [synced, summarised, taken, listed].filter(Boolean);
      return ok(notes.length ? `${text}\n${notes.join("\n")}` : text, {
        active: work.id,
        title: work.title,
        type: work.type,
        phase: work.phase,
        route: work.route,
        awaiting: work.awaiting,
        awaitingMessage: work.awaitingMessage ?? null,
        mail: { unread: inbox.unread, answered: inbox.answered, waiting: inbox.waiting },
        tasks,
        // The team of the item (SP7 §14): the seats, the session's team, the rounds spent.
        team: work.seats ?? [],
        primaryTeam: work.primaryTeam ?? null,
        rounds: {
          judgement: work.rounds?.judgement ?? 0,
          validation: work.rounds?.validation ?? 0,
        },
        debate: debateState(work),
        baseCommit: work.baseCommit,
        phases: PHASES_BY_ROUTE[work.route],
        verdict: result.verdict,
        unproven: result.unproven,
        // One name per gate, so the strip can draw a planned gate that has not run yet.
        expected: [...new Set(result.expected.map((p) => p.gate))],
        criteria: work.criteria.map((c) => ({
          id: c.id,
          kind: c.kind,
          text: c.text,
          tdd: tddSummary(work, result.evidence, c.id, c.kind, env.policy),
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
        'usage: crew mail send --to <project|.> --type question|change-request|notice|blocker [--agent <session|T-n|role>] [--item <id>] [--reply-to <mid>] [--subject <text>] "<text>" [--file <path>]';
      const usage = `${sendUsage} | inbox [--all] | read <mid> | reply <mid> "<text>" [--branch <b>] [--item <child id>] [--as <role>] [--file <path>] | refuse <mid> --reason "<why>" | status | stop <mid>`;
      const ctx = env.mail;
      const verb = args[0];
      if (verb === "send") {
        const to = parsed.flags.to;
        const type = parsed.flags.type;
        const text = args.slice(1).join(" ");
        if (typeof to !== "string" || !isMailType(type)) return refuse(sendUsage);
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
        const shown = parsed.flags.all
          ? messages
          : messages.filter(
              (m) =>
                m.status === "sent" ||
                m.status === "read" ||
                (m.status === "answered" && !m.replyTo),
            );
        const summary = inboxSummary(ctx);
        const lines = shown.map(
          (m) =>
            `  ${m.id} · ${m.type} · from ${partyLabel(m.from)} · ${m.subject} · ${m.status}${m.reason ? `: ${m.reason}` : ""}`,
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
          `status: ${result.status}${result.reason ? `: ${result.reason}` : ""}`,
          `at: ${result.at}`,
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
          },
          notes,
        );
        if ("refused" in result) return refuse(result.refused);
        return ok(
          `replied to ${args[1]}: ${result.reply.id} to ${result.reply.to.project}; ${args[1]} answered${notes.length ? `\n${notes.join("\n")}` : ""}`,
          { reply: result.reply, original: result.original, notes },
        );
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
  policy accept                         trust the current policy.json after a hand edit (asks the user)
  policy set <key> <value>              attendedDecisions prompt|relay, unattendedDecisions wait|count|validator, mail.workspace|name|open|maxConcurrent|maxHops|maxTurns|maxMinutes|worktrees (asks the user)
  accept <id|profile|policy>            trust state changed outside the engine (asks the user)
  start "<request>" --answers <json>    create a work item from the typed answers
      [--criterion "<text>"] [--preserve "<text>"]   criteria, repeatable; preserve: existing tests stay green
      [--origin <message id>]           the item answers a message of this project's inbox (a session opened by mail)
  classify <id> --answers <json>        record typed answers and compute the route
  criteria <id> add "<text>" [--kind preserve|observed]
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
      [--agent <session|T-n|role>] [--item <id>] [--reply-to <mid>] [--subject <text>] [--file <path>]
  mail inbox [--all] | read <mid> | reply <mid> "<text>" [--branch <b>] [--item <child>] [--as <role>] [--file <path>]
  mail refuse <mid> --reason "<why>" | status | stop <mid>   this project's mail and the sessions it opened (status sweeps them; stop kills one)
  task <id> open T-n --criteria AC-1,AC-2 [--text "<task text>"]   hand a task of the plan to an implementer: a message, a worktree, a branch, a session
  task <id> list | merge T-n [--force]   the tasks and their children; merge a proven child's branch (--force merges an unproven one: asks the user)
  tdd <red|green|before|after|observed> <id> <criterion> [--reason "<why>"] [-- <cmd>]
  gate run <id> [--only a,b]            run the gates the route requires; plans the judgement gates and writes their inputs to .crew/work/<id>/review/
  judgement <id> record --ruling <file>  record the rulings of a review file ({"rulings":[{gate,verdict,reviewer,judge,findings,tokens}]}); exit 0 once proven
  judgement <id> record <gate> --not-run --reason "<why>"   a judgement gate that could not run, never passed by default
  team <id>                   the seats the route plans for the item, with their reasons, recorded
  continue <id> judgement|validation|gate T-n   one more round past the policy's cap (the user's decision)
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
