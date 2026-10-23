import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync } from "node:fs";
import { dirname, join } from "node:path";
import { nowIso, readText } from "./fs.ts";
import {
  destinationPolicy,
  type MailContext,
  mailbox,
  readOpenSessions,
  recordOpened,
  updateEverywhere,
} from "./mail.ts";
import { mailStatus } from "./mail-status.ts";
import { dropOpenedMarker, writeOpenedMarker } from "./opened.ts";
import { resolvePaths } from "./paths.ts";
import { loadProfile } from "./profile.ts";
import type {
  MailStatus,
  Message,
  OpenedSession,
  OpenMode,
  Policy,
  Profile,
  ProjectEntry,
  TaskRecord,
  WorkItem,
} from "./types.ts";
import {
  addWorktree,
  dropBranch,
  removeWorktree,
  worktreeMainRoot,
  worktreePath,
} from "./worktree.ts";

/**
 * The parent session's variables a child must not inherit (spike A2, A8): the nesting guard, the
 * parent's identity and attendance, and its messaging socket.
 */
export const OPENER_STRIPS: readonly string[] = [
  "CLAUDECODE",
  "CLAUDE_CODE_ENTRYPOINT",
  "CLAUDE_CODE_CHILD_SESSION",
  "CLAUDE_CODE_SESSION_ID",
  "CLAUDE_CODE_SESSION_ATTENDED",
  "CLAUDE_CODE_MESSAGING_SOCKET",
  "CLAUDE_CODE_MESSAGING_TOKEN",
];
/**
 * A read-only session reads and replies, nothing else (spike A3 for the spellings). `crew` stays
 * whole, since the spike measured that spelling and no other: the hook keeps crew's writing verbs
 * out of a read-only session (`hooks/pre-tool-use.ts`).
 */
export const READ_ONLY_FLAGS: readonly string[] = [
  "--allowedTools",
  "Read",
  "Glob",
  "Grep",
  "Bash(crew *)",
  "--disallowedTools",
  "Write",
  "Edit",
  "MultiEdit",
  "NotebookEdit",
];

/**
 * A branch session runs the method on a task, so it gets the tools the method needs and nothing
 * broader (SP2c 8a, finding #42): git stays bounded by the hook (the pinned branch, no merge, no
 * deploy), and the project's own commands come from its profile (`commandGrants`).
 */
export const BRANCH_FLAGS: readonly string[] = [
  "--allowedTools",
  "Read",
  "Glob",
  "Grep",
  "Write",
  "Edit",
  "MultiEdit",
  "NotebookEdit",
  "Skill",
  "Agent",
  "Bash(crew *)",
  "Bash(git *)",
];

/**
 * One `Bash(<word> *)` per distinct first word of the profile's gate commands, in profile order:
 * the test runner, the linter, the builder a branch session runs. A leading assignment
 * (`CI=1 npm test`) is skipped to the command word.
 */
export function commandGrants(profile: Profile | null | undefined): string[] {
  const words: string[] = [];
  for (const target of profile?.targets ?? [])
    for (const gate of Object.values(target.gates)) {
      const word = gate?.command
        .trim()
        .split(/\s+/)
        .find((w) => !w.includes("="));
      if (word && !words.includes(word)) words.push(word);
    }
  return words.map((w) => `Bash(${w} *)`);
}

/** The binary the opener starts: `claude`, or what `WIZARDINGCODE_CREW_CLAUDE` names (the tests use a fake). */
export function claudeBinary(env: NodeJS.ProcessEnv): string {
  return env.WIZARDINGCODE_CREW_CLAUDE?.trim() || "claude";
}

/**
 * The plugin folder a child is given with `--plugin-dir`, when `WIZARDINGCODE_CREW_PLUGIN_DIR`
 * names one: a checkout or a sandbox where the user-scope plugin is not installed (spike A1: the
 * installed plugin loads on its own, so nothing is passed by default).
 */
export function pluginDirOf(env: NodeJS.ProcessEnv): string | null {
  return env.WIZARDINGCODE_CREW_PLUGIN_DIR?.trim() || null;
}

export interface OpenRequest {
  message: Message;
  mode: OpenMode;
  cwd: string;
  branch: string | null;
  prompt: string;
  maxTurns: number;
  maxMinutes: number;
  hops: number;
  /** The addressee the session speaks as: `session`, or the task `T-n`. */
  agent: string;
  log: string;
}

/**
 * The `claude -p` arguments of a session (SP2c §10): named first, so the name is read early in a
 * process listing; unattended, bounded, read-only when the message is a question.
 */
export function openerArgs(
  request: OpenRequest,
  options: { pluginDir: string | null; profile?: Profile | null },
): string[] {
  const args = [
    "--name",
    `crew-${request.message.id}`,
    "-p",
    request.prompt,
    "--permission-mode",
    "dontAsk",
    "--max-turns",
    String(request.maxTurns),
    "--output-format",
    "json",
  ];
  if (options.pluginDir) args.push("--plugin-dir", options.pluginDir);
  if (request.mode === "read-only") args.push(...READ_ONLY_FLAGS);
  else args.push(...BRANCH_FLAGS, ...commandGrants(options.profile));
  return args;
}

/** The log of a session this project opened for a message: beside the outbox. */
export function sessionLog(ctx: MailContext, id: string): string {
  return join(
    mailbox(ctx.paths.userDir, ctx.self.workspace, ctx.self.project).dir,
    "opened",
    `${id}.log`,
  );
}

/**
 * Starts the session and returns at once (SP2c §10): detached, its output in the log, the parent's
 * variables stripped, the mail variables set so the child's hooks know what opened it, which agent
 * it is, how many hops it stands from the first message and in which mode, and the branch it may
 * push pinned when it has one (a read-only session has none, so the hook denies every push there).
 * The record goes into the message.
 */
export function openSession(
  ctx: MailContext,
  request: OpenRequest,
  notes: string[] = [],
): OpenedSession | StartFailure {
  const env: NodeJS.ProcessEnv = { ...ctx.env };
  for (const key of OPENER_STRIPS) delete env[key];
  env.WIZARDINGCODE_CREW_MAIL_ID = request.message.id;
  env.WIZARDINGCODE_CREW_MAIL_AGENT = request.agent;
  env.WIZARDINGCODE_CREW_MAIL_HOPS = String(request.hops);
  env.WIZARDINGCODE_CREW_MAIL_MODE = request.mode;
  if (request.branch) env.WIZARDINGCODE_CREW_MAIL_BRANCH = request.branch;
  else delete env.WIZARDINGCODE_CREW_MAIL_BRANCH;
  // A branch session runs in a worktree the engine made: the record of what opened it goes to the
  // user's crew folder under that worktree's id, where the command and the hooks read it before the
  // variables. The worktree's paths key both the record and its removal.
  const paths = request.mode === "branch" ? resolvePaths(request.cwd, ctx.env) : null;
  if (request.mode === "branch") {
    if (!paths) return { failed: `${request.cwd} is not a checkout the engine can read` };
    try {
      writeOpenedMarker(paths, {
        mail: request.message.id,
        agent: request.agent,
        hops: request.hops,
      });
    } catch (error) {
      return {
        failed: `could not record the opener of ${request.cwd}: ${(error as Error).message}`,
      };
    }
  }
  // A session that does not start leaves no record of an opener behind it; one that started and was
  // stopped says so, for the caller's line.
  const undone = (failed: string, stopped?: true): StartFailure => {
    if (paths) dropOpenedMarker(paths.userDir, paths.root);
    return stopped ? { failed, stopped } : { failed };
  };
  let fd: number;
  try {
    mkdirSync(dirname(request.log), { recursive: true });
    fd = openSync(request.log, "a");
  } catch (error) {
    return undone(`could not open the log ${request.log}: ${(error as Error).message}`);
  }
  // The child takes its own copy of the log's descriptor at the spawn; the parent's is closed then.
  let child: ChildProcess;
  try {
    // The project whose code the session works on gives the grants: the main checkout of the
    // session's own folder (the lead's for a task, the destination's for a change request), never
    // the sender's.
    const projectPaths = resolvePaths(worktreeMainRoot(request.cwd) ?? request.cwd, ctx.env);
    const args = openerArgs(request, {
      pluginDir: pluginDirOf(ctx.env),
      profile: projectPaths ? loadProfile(projectPaths).profile : null,
    });
    child = spawn(claudeBinary(ctx.env), args, {
      cwd: request.cwd,
      env,
      detached: true,
      stdio: ["ignore", fd, fd],
    });
    // A binary that cannot start reports it after the fact; the missing pid says it here.
    child.on("error", () => {});
    child.unref();
  } catch (error) {
    closeSync(fd);
    return undone(`could not start ${claudeBinary(ctx.env)}: ${(error as Error).message}`);
  }
  closeSync(fd);
  if (child.pid === undefined) return undone("the session did not start (no pid)");
  const opened: OpenedSession = {
    mode: request.mode,
    cwd: request.cwd,
    branch: request.branch,
    pid: child.pid,
    name: `crew-${request.message.id}`,
    processStart: processStart(child.pid),
    maxTurns: request.maxTurns,
    maxMinutes: request.maxMinutes,
    startedAt: nowIso(),
    log: request.log,
  };
  // Recording the session can fail (the outbox changed outside the engine) or throw (a box's lock
  // held past the wait, a write refused). A session no outbox records would run unseen by the
  // sweep, the stop, the cap and the listing, so it is stopped at once; the copies that were written
  // say so, with the reason on the message, which stays `sent` (queued, as the line reports it);
  // and the start fails with the cause.
  let cause: string | null = null;
  try {
    if (
      !recordOpened(ctx, request.message.id, opened, (what) =>
        notes.push(`a copy of ${request.message.id} was not changed: ${what}`),
      )
    )
      cause = "a mailbox changed outside the engine";
  } catch (error) {
    cause = (error as Error).message;
  }
  if (cause) {
    killGroup(child.pid);
    const at = nowIso();
    try {
      // Best effort, after the cause: a copy this pass skips is the same box the cause names.
      updateEverywhere(
        ctx,
        request.message.id,
        (m) => ({
          ...m,
          reason: UNRECORDED,
          opened: ended(opened, "stopped", at),
        }),
        () => {},
      );
    } catch {
      // the same lock or box as the cause: the sender's line carries it
    }
    return undone(
      `the session started but the outbox could not record it (${cause}), so it was stopped`,
      true,
    );
  }
  return opened;
}

/** A start that failed: why, and whether a session had started and was stopped for it. */
export interface StartFailure {
  failed: string;
  stopped?: true;
}

/** A session's record once it ended, with how it ended. */
function ended(
  opened: OpenedSession,
  outcome: OpenedSession["outcome"],
  at: string,
): OpenedSession {
  return { ...opened, endedAt: at, outcome };
}
const UNRECORDED = "a session was started and stopped: the opener's outbox could not record it";

const RULES =
  "Rules of a session opened by mail: you never merge, push to another branch, release or deploy; you never approve a full-route spec (crew await <id> user instead); you may send mail with crew mail send only within the hop limit; you end with the reply, nothing after it.";

/** What a read-only session is told: read, answer, reply. */
export function questionPrompt(message: Message, projectName: string): string {
  return [
    `You are answering mail ${message.id} from ${message.from.project} in project ${projectName}, as its engineer, through the WizardingCode Developer Crew plugin.`,
    `Read the message first: crew mail read ${message.id}. Read the code; change nothing. Answer the question from what the code and the documentation of this repository say, with file paths and lines where they help, and say plainly what you could not find.`,
    `Then reply with crew mail reply ${message.id} "<your answer>" (or --file <path> for a long answer). ${RULES}`,
  ].join("\n\n");
}

/** What a session on a branch is told for a change request: run the method on this branch, reply with the branch and the item. */
export function changePrompt(message: Message, projectName: string, branch: string): string {
  return [
    `You are building mail ${message.id} from ${message.from.project} in project ${projectName}, on branch ${branch}, through the WizardingCode Developer Crew plugin and its crew skill.`,
    `Read the message first: crew mail read ${message.id}. Then run the method: answer the nine typed questions and start a work item with crew start "<the request>" --answers '<json>' --origin ${message.id}; follow the route the engine gives (criteria, red, green, gates, the judgement gates); commit on this branch.`,
    `End with crew mail reply ${message.id} --branch ${branch} --item <the work item id> "<what is proven and what is not>". ${RULES}`,
  ].join("\n\n");
}

/** What an implementer is told for a task of the lead's plan (SP2c §7). */
export function taskPrompt(
  parent: WorkItem,
  task: TaskRecord,
  message: Message,
  briefText: string | null,
  branch: string,
): string {
  return [
    `You are the implementer of task ${task.task} of work item ${parent.id} ("${parent.title}"), in a worktree on branch ${branch}, through the WizardingCode Developer Crew plugin and its crew skill. The lead opened this task as mail ${message.id}.`,
    `The task: ${task.text}`,
    `Its criteria, from the lead's item: ${task.criteria.join(", ")}. The lead's brief follows between the lines.\n---\n${briefText?.trim() ?? "(no brief)"}\n---`,
    `Start with crew start "${task.task} of ${parent.id}: ${task.text.split("\n")[0]}" --answers '<json>' --origin ${message.id} and one --criterion per criterion the task covers, in the lead's words; follow the route the engine gives; commit on this branch; touch only the files the task names.`,
    `A question to the lead: crew mail send --to . --agent session --type question "<question>" then crew await <id> mail <message id>. A question to another task: --agent T-n. A question only the user can answer: crew await <id> user.`,
    `End with crew mail reply ${message.id} --branch ${branch} --item <your work item id> "<what is proven and what is not>". ${RULES}`,
  ].join("\n\n");
}

/** Whether a process with this pid is running; false for no pid. */
export function isAlive(pid: number | null): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * One column of `ps` for a process (`lstart=` its start time, `stat=` its state); empty when it
 * cannot be read. Read in the C locale and UTC, whatever the caller's shell set: the start time is
 * recorded by one process (the command that opened the session) and compared by others (the hooks,
 * later commands), and `ps` prints it in the caller's locale and time zone (risk review, round 3).
 */
function psColumn(pid: number, column: string): string {
  try {
    return execFileSync("ps", ["-o", column, "-p", String(pid)], {
      encoding: "utf8",
      env: { ...process.env, LC_ALL: "C", TZ: "UTC" },
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

/** A process's start time as `ps` prints it in the C locale and UTC (`Thu Oct 15 09:14:46 2026`), the identity the record keeps. */
export function processStart(pid: number): string {
  return psColumn(pid, "lstart=");
}

/**
 * What the pid a session was recorded with is now: the session, alive and started when the record
 * says (the real binary shows no arguments in a process listing, so its name cannot tell it; its
 * start time can); gone, ended whether reaped or not; or another process's, one that took the pid
 * since, which is never the session and never signalled (SP2c review focus 5). Where `ps` cannot
 * be read, or the record predates the start time, a live pid counts as the session.
 */
export function pidState(opened: OpenedSession): "session" | "gone" | "another" {
  if (opened.pid === null || processGone(opened.pid)) return "gone";
  const start = processStart(opened.pid);
  return !start || !opened.processStart || start === opened.processStart ? "session" : "another";
}

/** Whether the pid a session was recorded with is still that session. */
export function isSession(opened: OpenedSession): boolean {
  return pidState(opened) === "session";
}

/** Whether a pid is no process any more: not alive, or ended and not reaped yet (`kill -0` succeeds on one its parent has not reaped, so its state is read too). */
export function processGone(pid: number): boolean {
  return !isAlive(pid) || psColumn(pid, "stat=").startsWith("Z");
}

/** The end of a session as `claude -p --output-format json` prints it: the last JSON line with a result, and the error it reports, if any. */
export function readOutcome(log: string): {
  ended: boolean;
  turns?: number;
  costUsd?: number;
  /** The result's subtype (`error_max_turns`) or its text when the result is an error. */
  error?: string;
} {
  const text = readText(log);
  if (!text) return { ended: false };
  for (const line of text.trim().split("\n").reverse()) {
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      if (!("result" in parsed) && !("session_id" in parsed)) continue;
      const failed =
        parsed.is_error === true ||
        (typeof parsed.subtype === "string" && parsed.subtype !== "success");
      const reason =
        typeof parsed.subtype === "string" && parsed.subtype !== "success"
          ? parsed.subtype
          : typeof parsed.result === "string" && parsed.result.trim()
            ? (parsed.result.trim().split("\n")[0] as string)
            : "an error result";
      return {
        ended: true,
        ...(typeof parsed.num_turns === "number" ? { turns: parsed.num_turns } : {}),
        ...(typeof parsed.total_cost_usd === "number" ? { costUsd: parsed.total_cost_usd } : {}),
        ...(failed ? { error: reason } : {}),
      };
    } catch {
      // not a JSON line
    }
  }
  return { ended: false };
}

const KILL_WAIT_MS = 1000;
const KILL_STEP_MS = 50;

/**
 * Ends a detached session: the process group it leads (the shell and what it started; never a bare
 * pid) is asked to end, given a second, then killed whole, whether or not its leader has gone (a
 * member that ignored the request, a tool's child, goes with it), so "stopped" is true when it is
 * recorded. The wait blocks this process: the command or the hook that stops a session.
 */
export function killGroup(pid: number): void {
  const signal = (name: NodeJS.Signals): void => {
    try {
      process.kill(-pid, name);
    } catch {
      // already gone
    }
  };
  signal("SIGTERM");
  const until = Date.now() + KILL_WAIT_MS;
  while (!processGone(pid) && Date.now() < until)
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, KILL_STEP_MS);
  signal("SIGKILL");
}

/** The minutes a session has run, from its start to `now`. */
export function minutesRun(opened: OpenedSession, now = Date.now()): number {
  return (now - Date.parse(opened.startedAt)) / 60_000;
}

/** `1 minute`, `30 minutes`. */
export function minutesText(minutes: number): string {
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

/** A message still waiting for its session's answer: the end of the session without one expires it. */
function unanswered(status: MailStatus): boolean {
  return status === "sent" || status === "read";
}

export interface SweepResult {
  /** Sessions whose log holds a result (the session ended on its own). */
  ended: string[];
  /** Sessions stopped, failed or gone: their messages are expired unless already answered. */
  expired: string[];
  /** One line per session settled, for the hooks and `mail status` to say. */
  lines: string[];
}

/**
 * Settles one session this project opened (SP2c §10). The process is the truth, read first: a
 * session that is still itself runs on, and is killed by its process group only past its minutes
 * (whatever its log says; the log is the session's to write). Once the process is not the session
 * (ended, or the pid taken by another, which is never signalled), the log's end says how it went:
 * an error result is a failure with the result's reason, a clean end with no reply expires the
 * message with its own, no end at all is a session gone without a reply.
 */
function sweepOne(ctx: MailContext, m: Message, now: number, result: SweepResult): void {
  const opened = m.opened as OpenedSession;
  const at = new Date(now).toISOString();
  const settle = (
    kind: "ended" | "expired",
    end: Partial<OpenedSession> & { outcome: OpenedSession["outcome"] },
    reason: string | null,
    line: string,
  ): void => {
    // Every copy of the message in one pass, each changed from its own state; the result says what
    // was settled only once it is recorded: a record that fails, or that reaches no copy (the box
    // changed between the read and the write), is the sweep's own line, not an end.
    const recorded = updateEverywhere(
      ctx,
      m.id,
      (x) => ({
        ...x,
        ...(reason && unanswered(mailStatus(x)) ? { status: "expired", reason } : {}),
        opened: { ...ended(opened, end.outcome, at), ...end },
      }),
      (what) => result.lines.push(`the record of ${m.id} skipped a box it could not read: ${what}`),
    );
    if (recorded === null) {
      result.lines.push(`the sweep could not record ${m.id}: no copy of the message was written`);
      return;
    }
    // The session is over: its checkout is nobody's child from here on.
    if (opened.mode === "branch") dropOpenedMarker(ctx.paths.userDir, opened.cwd);
    result[kind].push(m.id);
    result.lines.push(line);
  };
  // The process is read once: what it is now decides the branch, and the gone leader's line below.
  const state = pidState(opened);
  if (state === "session") {
    if (minutesRun(opened, now) > opened.maxMinutes) {
      killGroup(opened.pid as number);
      const limit = minutesText(opened.maxMinutes);
      settle(
        "expired",
        { outcome: "expired" },
        `the session ran past ${limit} (mail.maxMinutes) and was stopped`,
        `${m.id} ran past ${limit} and was stopped (expired)`,
      );
    }
    return;
  }
  const outcome = readOutcome(opened.log);
  const measured = {
    ...(outcome.turns !== undefined ? { turns: outcome.turns } : {}),
    ...(outcome.costUsd !== undefined ? { costUsd: outcome.costUsd } : {}),
  };
  if (outcome.ended && outcome.error) {
    settle(
      "expired",
      { ...measured, outcome: "failed" },
      `the session ended with ${outcome.error}`,
      `${m.id} ended with ${outcome.error} (expired)`,
    );
    return;
  }
  if (outcome.ended) {
    const replied = !unanswered(mailStatus(m));
    settle(
      "ended",
      { ...measured, outcome: "ended" },
      replied ? null : "the session ended without a reply",
      replied
        ? `${m.id} ended (${outcome.turns ?? "?"} turns, ${outcome.costUsd ?? "?"} USD)`
        : `${m.id} ended without a reply (expired)`,
    );
    return;
  }
  // The leader is gone with no end of its own (a crash, a kill from outside). Nothing of the session
  // is signalled. A pid another process holds means the session's group is empty (a pid is never
  // reused while a group with that id exists); a pid nobody holds may still name a group with a
  // member that outlived the leader (a tool's child), which is the person's to find.
  const remains =
    state === "another"
      ? "its pid is now another process's, and nothing of the session remains in its group"
      : `a member of its process group may remain (ps -g ${opened.pid})`;
  settle(
    "expired",
    { outcome: "failed" },
    "the session ended without a reply",
    `${m.id} is gone without a reply (expired); ${remains}`,
  );
}

/**
 * What became of the sessions this project opened (SP2c §10): each settled as `sweepOne` says. A
 * session opened by mail sweeps nothing: the project's sessions are the lead's to settle and stop
 * (an implementer past its minutes would otherwise kill its own group from inside).
 */
export function sweepOpened(ctx: MailContext, now = Date.now()): SweepResult {
  const result: SweepResult = { ended: [], expired: [], lines: [] };
  if (ctx.self.openedBy) return result;
  // An outbox changed outside the engine settles nothing, and says so rather than nothing.
  const { messages, tampered } = readOpenSessions(ctx);
  if (tampered) result.lines.push(tampered);
  // Each session settled on its own: one whose record cannot be written costs its own line, not
  // the lines of the sessions settled before it (risk review of SP2c task 4, round 15).
  for (const m of messages) {
    try {
      sweepOne(ctx, m, now, result);
    } catch (error) {
      result.lines.push(`the sweep of ${m.id} failed: ${(error as Error).message.split("\n")[0]}`);
    }
  }
  return result;
}
/**
 * `sweepOpened` for a hook or a command that must go on whatever the sweep does: a sweep that fails
 * before any session is reached (the mailbox unreadable) costs nothing but the sweep and says so in
 * one line, so a sweep that fails every turn is seen in the first hour rather than never, and a
 * listing is not lost to it (risk review of SP2c task 4, rounds 11 and 14).
 */
export function sweepSafely(ctx: MailContext, now = Date.now()): SweepResult {
  try {
    return sweepOpened(ctx, now);
  } catch (error) {
    return {
      ended: [],
      expired: [],
      lines: [`the sweep failed: ${(error as Error).message.split("\n")[0]}`],
    };
  }
}

/**
 * `crew mail stop <id>`: the session killed and the message `stopped`, or the refusal: none runs,
 * it already ended (settled here, as the sweep would), or this is a session opened by mail, which
 * stops no sessions (the outbox is the project's, shared with the lead).
 */
export function stopSession(
  ctx: MailContext,
  id: string,
  notes: string[],
): Message | { refused: string } {
  if (ctx.self.openedBy)
    return { refused: `a session opened by mail (${ctx.self.openedBy}) stops no sessions` };
  const { messages, tampered } = readOpenSessions(ctx);
  if (tampered) return { refused: tampered };
  const m = messages.find((x) => x.id === id);
  if (!m?.opened) return { refused: `${id} has no session running` };
  if (!isSession(m.opened)) {
    // The session is settled here, and what its record could not change is said with the refusal.
    const swept: SweepResult = { ended: [], expired: [], lines: [] };
    // A settle that throws is the refusal, as `sweepSafely` says it (finding 30): never a throw.
    try {
      sweepOne(ctx, m, Date.now(), swept);
    } catch (error) {
      const failed = `the settle of ${id} failed: ${(error as Error).message.split("\n")[0]}`;
      return {
        refused: `${id} has no session running (${[...swept.lines, failed].join("; ")})`,
      };
    }
    return {
      refused: `${id} has no session running: it ${readOutcome(m.opened.log).ended ? "ended" : "is gone"}${swept.lines.length ? ` (${swept.lines.join("; ")})` : ""}`,
    };
  }
  killGroup(m.opened.pid as number);
  if (m.opened.mode === "branch") dropOpenedMarker(ctx.paths.userDir, m.opened.cwd);
  const at = nowIso();
  return (
    updateEverywhere(
      ctx,
      id,
      (x) => ({
        ...x,
        ...(unanswered(mailStatus(x))
          ? { status: "refused", reason: "stopped by crew mail stop" }
          : {}),
        opened: ended(x.opened as OpenedSession, "stopped", at),
      }),
      (what) => notes.push(`a copy of ${id} was not changed: ${what}`),
    ) ?? {
      refused: `${id} was stopped but could not be updated: its mailbox changed while it was being written`,
    }
  );
}

/**
 * Opens the session a sent message needs (a question: read-only at the destination's root; a
 * change request: on a branch `crew/mail/<id>` of the destination, in a worktree beside its root
 * or under its `mail.worktrees`) and returns the line `mail send` prints. The limits are the
 * destination's (`fallback` when its policy cannot be read). A failure to open leaves the message
 * queued and says why.
 */
export function openForMail(
  ctx: MailContext,
  fallback: Policy,
  message: Message,
  delivery: { mode: OpenMode; entry: ProjectEntry },
): string {
  const dest = delivery.entry;
  const limits = (destinationPolicy(dest, ctx.env)?.policy ?? fallback).mail;
  let cwd = dest.root;
  let branch: string | null = null;
  let prompt = questionPrompt(message, dest.name);
  if (delivery.mode === "branch") {
    branch = `crew/mail/${message.id}`;
    cwd = worktreePath(dest.root, limits.worktrees, `mail-${message.id}`);
    const made = addWorktree(dest.root, branch, cwd);
    if (made) {
      dropBranch(dest.root, branch);
      return `could not open a session: ${made.failed}; queued`;
    }
    prompt = changePrompt(message, dest.name, branch);
  }
  const notes: string[] = [];
  const opened = openSession(
    ctx,
    {
      message,
      mode: delivery.mode,
      cwd,
      branch,
      prompt,
      maxTurns: limits.maxTurns,
      maxMinutes: limits.maxMinutes,
      hops: ctx.self.hops + 1,
      agent: "session",
      log: sessionLog(ctx, message.id),
    },
    notes,
  );
  // What the record pass could not change, said with the line whether the session started or not.
  const skipped = notes.length ? `; ${notes.join("; ")}` : "";
  if ("failed" in opened) {
    // What was made for a session that never started goes too: the worktree (never by force) and
    // the branch (the record of its opener went with the failed start).
    if (branch) {
      // A worktree the removal refuses (a file written into it meanwhile) is kept, never removed by
      // force, with its branch, and named with git's reason, git's advice left out.
      const kept = removeWorktree(dest.root, cwd);
      if (kept)
        return `could not open a session: ${opened.failed}; queued; the worktree ${cwd} is kept, with its branch ${branch}: ${kept.kept.replace(/,?\s*use --force[^.]*\.?$/, "")}${skipped}`;
      dropBranch(dest.root, branch);
    }
    return `could not open a session: ${opened.failed}; queued${skipped}`;
  }
  const bounds = `${opened.maxTurns} turns, ${minutesText(opened.maxMinutes)}`;
  return delivery.mode === "read-only"
    ? `read-only session opened (${opened.name}, pid ${opened.pid}, ${bounds})${skipped}`
    : `session opened on branch ${branch} (${opened.name}, pid ${opened.pid}, ${bounds})${skipped}`;
}
