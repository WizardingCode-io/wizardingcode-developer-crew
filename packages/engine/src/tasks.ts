import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadEvidence, saveEvidence, tddSummary } from "./evidence.ts";
import { gitChangedPaths, gitHead, isGitRepo, isWatched } from "./fingerprint.ts";
import { nowIso, readText, writeText } from "./fs.ts";
import {
  type MailContext,
  mailbox,
  openIn,
  ownInbox,
  readBox,
  readOpenSessions,
  send,
  updateStatusEverywhere,
} from "./mail.ts";
import { mailStatus } from "./mail-status.ts";
import { openSession, type StartFailure, sessionLog, sweepSafely, taskPrompt } from "./open.ts";
import { dropOpenedMarker } from "./opened.ts";
import { type CrewPaths, resolvePaths, workDir } from "./paths.ts";
import { recordIntegrity } from "./store.ts";
import type {
  Decision,
  Evidence,
  MailStatus,
  Message,
  OpenedSession,
  Policy,
  Profile,
  TaskRecord,
  WorkItem,
} from "./types.ts";
import { loadWork, saveWork } from "./work.ts";
import {
  addWorktree,
  dropBranch,
  gitError,
  gitRun,
  removeWorktree,
  worktreePath,
} from "./worktree.ts";

/** `2026-10-15-042`: the date and the sequence of an item id (plan decision 2). */
export function shortId(workId: string): string {
  return workId.slice(0, 14);
}

/** The branch and the worktree of a task: under the policy's `mail.worktrees` (beside the root by default; plan decision 12). */
export function taskNames(
  workId: string,
  repoRoot: string,
  task: string,
  worktrees: string,
): { branch: string; worktree: string } {
  const short = shortId(workId);
  return {
    branch: `crew/${short}/${task}`,
    worktree: worktreePath(repoRoot, worktrees, `${short}-${task}`),
  };
}

/** The plan's text for a task: the numbered line `n.` with its indented continuation, or the section headed `T-n` / `Task n`. */
export function taskText(planText: string | null, task: string): string | null {
  if (!planText) return null;
  const n = task.slice(2);
  const lines = planText.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const numbered = new RegExp(`^${n}\\.\\s+(.*)$`).exec(line);
    if (numbered) {
      const parts = [numbered[1] ?? ""];
      for (let j = i + 1; j < lines.length && /^\s+\S/.test(lines[j] ?? ""); j++)
        parts.push((lines[j] ?? "").trim());
      return parts.join("\n").trim();
    }
    if (new RegExp(`^#{1,6}\\s*(?:T-${n}|Task ${n})\\b`).test(line)) {
      const parts: string[] = [];
      for (let j = i + 1; j < lines.length && !/^#{1,6}\s/.test(lines[j] ?? ""); j++)
        parts.push(lines[j] ?? "");
      return parts.join("\n").trim() || null;
    }
  }
  return null;
}

function dirtyWatched(root: string, profile: Profile): string[] {
  return (gitChangedPaths(root) ?? []).filter((p) => isWatched(p, profile));
}

interface TaskEnv {
  paths: CrewPaths;
  policy: Policy;
  profile: Profile;
}

/**
 * Hands a task to an implementer (SP2c §7): a change request from the project to itself, a
 * worktree on a branch from HEAD, a headless session with a prompt the engine writes, and the
 * record in the lead's `tasks[]`. Refused in a session opened by mail, outside git, for a task
 * already open, past the project's `mail.maxConcurrent`, with uncommitted watched changes (the
 * child branches from a commit), or when the branch or the folder exists.
 */
export function openTask(
  ctx: MailContext,
  env: TaskEnv,
  work: WorkItem,
  task: string,
  criteria: string[],
  text: string | undefined,
):
  | { record: TaskRecord; message: Message; opened: OpenedSession | StartFailure; notes: string[] }
  | { refused: string } {
  if (ctx.self.openedBy)
    return { refused: `a session opened by mail (${ctx.self.openedBy}) opens no tasks of its own` };
  if (!isGitRepo(env.paths.root) || gitHead(env.paths.root) === "none")
    return { refused: "a task needs a git repository with a commit to branch from" };
  if (!/^T-\d+$/.test(task)) return { refused: `a task is named T-n, not ${task}` };
  const unknown = criteria.find((c) => !work.criteria.some((k) => k.id === c));
  if (unknown) return { refused: `unknown criterion: ${unknown}` };
  const existing = (work.tasks ?? []).find((t) => t.task === task);
  if (existing)
    return {
      refused: `${task} is already open (message ${existing.message}, branch ${existing.branch})`,
    };
  // The cap of sessions open in this project counts the tasks too (SP2c §6, §7): a task's message
  // is mail to the project itself, which `send` delivers without opening, so the count is made here.
  const open = openIn(ctx.paths.userDir, ctx.self.workspace, ctx.self.project);
  const max = env.policy.mail.maxConcurrent;
  if (open >= max)
    return {
      refused: `${open} session${open === 1 ? "" : "s"} open in ${ctx.self.project} (mail.maxConcurrent ${max}); wait for ${open === 1 ? "it" : "one"} to end, or stop ${open === 1 ? "it" : "one"} with crew mail stop`,
    };
  const dirty = dirtyWatched(env.paths.root, env.profile);
  if (dirty.length)
    return {
      refused: `uncommitted changes in ${dirty.join(", ")}; commit what the implementer must see, then open the task`,
    };
  const body =
    text?.trim() || taskText(readText(join(workDir(env.paths, work.id), "plan.md")), task);
  if (!body)
    return { refused: `plan.md names no task ${task}; give its text with --text "<task>"` };
  const names = taskNames(work.id, env.paths.root, task, env.policy.mail.worktrees);
  if (existsSync(names.worktree))
    return { refused: `${names.worktree} exists; remove it or pick another task number` };
  let branches: string;
  try {
    branches = gitRun(env.paths.root, "branch", "--list", names.branch);
  } catch (error) {
    return { refused: `the branches of ${env.paths.root} cannot be read: ${gitError(error)}` };
  }
  if (branches)
    return { refused: `branch ${names.branch} exists; delete it or pick another task number` };
  const record: TaskRecord = {
    task,
    message: "",
    criteria,
    text: body,
    branch: names.branch,
    worktree: names.worktree,
    openedAt: nowIso(),
    state: "handed",
  };
  // The record goes in before the message: `send` admits a task's message only for a task of the item.
  work.tasks = [...(work.tasks ?? []), record];
  const sent = send(
    ctx,
    {
      to: ".",
      agent: task,
      type: "change-request",
      subject: `${task} of ${work.id}`,
      text: `${body}\n\nCriteria: ${criteria.map((c) => `${c} ${work.criteria.find((k) => k.id === c)?.text ?? ""}`).join("; ")}`,
    },
    work,
  );
  if ("refused" in sent) {
    work.tasks = work.tasks.filter((t) => t !== record);
    return { refused: sent.refused };
  }
  record.message = sent.message.id;
  const made = addWorktree(env.paths.root, names.branch, names.worktree);
  if (made) {
    // The message is already written: refused with git's reason, so no task waits on it and the
    // same task can be opened again; git makes the branch before the folder, so the branch it left
    // goes too (it was not there before: checked above).
    work.tasks = work.tasks.filter((t) => t !== record);
    const notes: string[] = [];
    updateStatusEverywhere(ctx, sent.message.id, "refused", made.failed, notes);
    dropBranch(env.paths.root, names.branch);
    return { refused: notes.length ? `${made.failed}; ${notes.join("; ")}` : made.failed };
  }
  saveWork(env.paths, work);
  const brief = readText(join(workDir(env.paths, work.id), "brief.md"));
  const notes: string[] = [];
  const opened = openSession(
    ctx,
    {
      message: sent.message,
      mode: "branch",
      cwd: names.worktree,
      branch: names.branch,
      prompt: taskPrompt(work, record, sent.message, brief, names.branch),
      maxTurns: env.policy.mail.maxTurns,
      maxMinutes: env.policy.mail.maxMinutes,
      hops: ctx.self.hops + 1,
      agent: task,
      log: sessionLog(ctx, sent.message.id),
    },
    notes,
  );
  return { record, message: sent.message, opened, notes };
}

/** Each task with the message's status as the mailbox has it, and the child's verdict from the reply or the worktree. */
/**
 * A todo the lead does inline (SP7 §8.1): no worktree and no message, its work already in the
 * checkout, its scope the files it touched, so its gate and its brief run like a handed-out task's.
 */
export function noteTask(
  work: WorkItem,
  task: string,
  criteria: string[],
  scope: string[],
  text: string | null,
): { record: TaskRecord } | { refused: string } {
  if (!/^T-\d+$/.test(task)) return { refused: `a task is named T-n, not ${task}` };
  if ((work.tasks ?? []).some((t) => t.task === task))
    return { refused: `${task} is already a task of this item` };
  const unknown = criteria.find((c) => !work.criteria.some((k) => k.id === c));
  if (unknown) return { refused: `unknown criterion: ${unknown}` };
  if (!scope.length)
    return { refused: "a scope names at least one file (--scope <path>[,<path>])" };
  const escaped = scopeRefusal(scope);
  if (escaped) return { refused: escaped };
  if (!text)
    return { refused: `plan.md names no task ${task}; give its text with --text "<todo>"` };
  const record: TaskRecord = {
    task,
    message: "",
    criteria,
    text,
    branch: "",
    worktree: "",
    openedAt: nowIso(),
    inline: true,
    scope,
    state: "merged",
  };
  work.tasks = [...(work.tasks ?? []), record];
  return { record };
}

/**
 * A scope path names a file of this repository: relative, with no `..` segment, on one line. The
 * merge commit's diff cannot name anything else; the `--scope` flag could, and is refused.
 */
export function scopeRefusal(scope: readonly string[]): string | null {
  const outside = scope.find(
    (p) =>
      p.startsWith("/") ||
      /^[A-Za-z]:[\\/]/.test(p) ||
      p.split(/[\\/]/).includes("..") ||
      /[\n\r\0]/.test(p),
  );
  return outside === undefined
    ? null
    : `a scope path stays inside the repository: ${JSON.stringify(outside)}`;
}

/**
 * The files a todo's gate runs on (SP7 §8.1): the declared scope of an inline todo (or the flag's),
 * or the watched files its merge commit changed against the main parent. A merge commit rewritten
 * away refuses rather than guesses; a task not merged has nothing in this checkout yet.
 */
export function taskScope(
  root: string,
  profile: Profile,
  record: TaskRecord,
  flagScope?: string[],
): { scope: string[] } | { refused: string } {
  const escaped = flagScope?.length ? scopeRefusal(flagScope) : null;
  if (escaped) return { refused: escaped };
  if (record.inline) return { scope: flagScope?.length ? flagScope : (record.scope ?? []) };
  if (!record.mergedAt || !record.mergeCommit)
    return { refused: `${record.task} is not merged yet (crew task <id> merge ${record.task})` };
  const commit = record.mergeCommit;
  // The todo's files are in this checkout only while its merge commit is in HEAD's history; a
  // commit rewritten away (a reset, a rebase) still sits in the object store, so reachability is
  // the test, not existence.
  try {
    gitRun(root, "merge-base", "--is-ancestor", commit, "HEAD");
  } catch {
    return {
      refused: `merge commit ${commit.slice(0, 7)} of ${record.task} is not in this checkout's history; restore it or note the todo again`,
    };
  }
  const changed = gitRun(root, "diff", "--name-only", `${commit}^1`, commit)
    .split("\n")
    .map((p) => p.trim())
    .filter((p) => p && isWatched(p, profile));
  return { scope: flagScope?.length ? flagScope : changed };
}

/**
 * The todo's brief (SP7 §8.1), from the records alone: what changed (its scope), what was proven
 * (its gate's runs and its criteria's test-first summaries) and what is left (the open returns of
 * the leads' delivery validations). Written as `tasks/<task>.brief.md`; the record points at it.
 */
export function writeBrief(
  paths: CrewPaths,
  work: WorkItem,
  record: TaskRecord,
  evidence: Evidence,
  policy: Policy,
): string {
  const gate = record.gate;
  const proven = [
    ...(gate?.runs ?? []).map(
      (r) => `- ${r.gate} (${r.target}): ${r.status} in ${(r.durationMs / 1000).toFixed(1)}s`,
    ),
    ...record.criteria.map((id) => {
      const criterion = work.criteria.find((c) => c.id === id);
      return `- ${id}: ${criterion ? tddSummary(work, evidence, id, criterion.kind, policy) : "unknown criterion"}`;
    }),
  ];
  const left = (work.validations ?? [])
    .filter((v) => v.what === "delivery" && v.verdict === "returned")
    .map((v) => `- ${v.by} returned ${v.returns} return${v.returns === 1 ? "" : "s"} (${v.file})`);
  const text = [
    `# Brief: ${record.task} of ${work.id}`,
    "",
    "## Changed",
    ...(gate?.scope.length ? gate.scope.map((p) => `- ${p}`) : ["- nothing recorded"]),
    "",
    "## Proven",
    ...(proven.length ? proven : ["- nothing yet"]),
    "",
    "## Left",
    ...(left.length ? left : ["- none"]),
    "",
  ].join("\n");
  const file = `tasks/${record.task}.brief.md`;
  writeText(join(workDir(paths, work.id), file), text);
  record.brief = file;
  record.state = "briefed";
  return text;
}

export function listTasks(
  ctx: MailContext,
  work: WorkItem,
): { task: TaskRecord; status: MailStatus; verdict: string; implementer: string | null }[] {
  const inbox = readBox(
    mailbox(ctx.paths.userDir, ctx.self.workspace, ctx.self.project).dir,
    "inbox",
  ).box.messages;
  return (work.tasks ?? []).map((t) => {
    const m = inbox.find((x) => x.id === t.message);
    // A task with no child yet says what became of its implementer when there is none, or when the
    // one started ended (stopped, failed, expired) with the reason the record keeps; one still
    // running says nothing more.
    const implementer = t.child
      ? null
      : !m?.opened
        ? "no implementer"
        : m.opened.endedAt
          ? `implementer ${m.opened.outcome ?? "ended"}${m.reason ? `: ${m.reason}` : ""}`
          : null;
    return {
      task: t,
      status: m ? mailStatus(m) : "sent",
      verdict: t.verdict ?? m?.verdict ?? "no reply yet",
      implementer,
    };
  });
}

/**
 * The replies that landed, taken into the lead's record and saved, by the hooks and the commands
 * that read the item (SP2c §7), so `crew task list` and the report are current without a command.
 * A hand-edited item is left as it is, since saving it would record the edit as the engine's own.
 */
export function takeReplies(
  ctx: MailContext,
  paths: CrewPaths,
  active: { work: WorkItem | null; tampered: boolean },
): void {
  const work = active.work;
  if (work && !active.tampered && absorbReplies(ctx, work)) saveWork(paths, work);
}

/** The reply to a task's message, when one landed: fills child, verdict and repliedAt on the lead's record. True when a record changed. */
export function absorbReplies(ctx: MailContext, work: WorkItem): boolean {
  const inbox = ownInbox(ctx).messages;
  let changed = false;
  for (const t of work.tasks ?? []) {
    if (t.child) continue;
    const r = inbox.find((m) => m.replyTo === t.message);
    if (!r?.item) continue;
    t.child = r.item;
    t.verdict = r.verdict ?? "unproven";
    t.repliedAt = r.at;
    changed = true;
  }
  return changed;
}

const CHILD_RECORD_FILES = [
  "work.json",
  "evidence.json",
  "report.md",
  "objections.json",
  "mail.json",
];

/**
 * Merges a task's branch into the lead's checkout (SP2c §7). Refused in a session opened by mail,
 * for a task already merged, with no reply yet, when the worktree is gone (the child's record is
 * checked there, so the merge needs it), when the child's record in its worktree changed outside
 * the engine or is not the item that started from the task's message, for an unproven child
 * unless the user forces it (`forcedBy`, recorded), for a dirty checkout, while the implementer's
 * session still runs, when the branch cannot be compared with HEAD, when it changes any record
 * under `.crew` but its child's (a move or a deletion included: renames are not followed), and
 * when the child's record it carries is not the one checked in the worktree (the merge brings the
 * branch's files). The merge is `--no-ff` and recorded as soon as it is committed; then the
 * child's record is copied into the lead's checkout where the merge did not bring it (a local
 * item, the logs) and trusted there; the worktree is removed unless it holds uncommitted files,
 * and the branch stays as the record.
 */
export function mergeTask(
  ctx: MailContext,
  env: TaskEnv,
  work: WorkItem,
  task: string,
  options: { forcedBy?: Decision } = {},
):
  | {
      record: TaskRecord;
      commit: string;
      swept: string[];
      worktreeKept?: string;
      /** The parent's criteria whose proof is now the child's (SP2c 8a). */
      credited: string[];
      /** Why none was, when none was. */
      uncredited: string | null;
    }
  | { refused: string } {
  if (ctx.self.openedBy)
    return { refused: `a session opened by mail (${ctx.self.openedBy}) never merges` };
  const record = (work.tasks ?? []).find((t) => t.task === task);
  if (!record) return { refused: `${task} is not a task of ${work.id}` };
  if (record.mergedAt) return { refused: `${task} is already merged` };
  absorbReplies(ctx, work);
  const child = record.child;
  if (!child)
    return {
      refused: `${task} has no reply yet (message ${record.message}); the implementer ends with crew mail reply`,
    };
  const childPaths = existsSync(record.worktree) ? resolvePaths(record.worktree, ctx.env) : null;
  if (!childPaths)
    return {
      refused: `${task}'s worktree ${record.worktree} is gone; restore it with git worktree add ${record.worktree} ${record.branch}, then merge`,
    };
  const checked = childRecordVerdict(record, child, childPaths);
  if ("refused" in checked) return checked;
  record.verdict = checked.verdict;
  if (record.verdict !== "proven" && !options.forcedBy)
    return {
      refused: `${task}'s child ${child} is not proven; the user may merge it anyway with crew task ${work.id} merge ${task} --force`,
    };
  const dirty = dirtyWatched(env.paths.root, env.profile);
  if (dirty.length)
    return {
      refused: `uncommitted changes in ${dirty.join(", ")}; commit or stash them, then merge`,
    };
  // The implementer's session must have ended before its worktree goes; what the sweep could not
  // settle is said with the refusal, so a dead session whose record failed is not taken for a live one.
  const swept = sweepSafely(ctx);
  // What that sweep settled or could not goes with whatever the merge answers, since no later sweep
  // says it again; a line that is the refusal's own text is not said twice.
  const withSwept = (refused: string): { refused: string } => {
    const lines = swept.lines.filter((l) => l !== refused);
    return { refused: lines.length ? `${refused} (${lines.join("; ")})` : refused };
  };
  const sessions = readOpenSessions(ctx);
  if (sessions.tampered) return withSwept(sessions.tampered);
  const running = sessions.messages.find((m) => m.id === record.message);
  if (running)
    return withSwept(
      `${task}'s implementer is still running (pid ${running.opened?.pid}); wait for it to end, or stop it with crew mail stop ${record.message}`,
    );
  const branch = branchContentRefusal(record, child, env.paths.root);
  if (branch) return withSwept(branch.refused);
  const subject = `Merge ${task} of ${work.id} (${record.branch}): ${child}, ${record.verdict ?? "unproven"}${options.forcedBy ? ", forced by the user" : ""}`;
  try {
    gitRun(env.paths.root, "merge", "--no-ff", "-m", subject, record.branch);
  } catch (error) {
    return withSwept(
      `git merge failed: ${gitError(error)}; resolve it by hand (or git merge --abort) and run the merge again`,
    );
  }
  // The merge is recorded as soon as it is committed: what follows can fail without a merge the record forgot.
  const commit = gitHead(env.paths.root);
  record.mergedAt = nowIso();
  record.mergeCommit = commit;
  record.state = "merged";
  if (options.forcedBy) record.forcedBy = options.forcedBy;
  saveWork(env.paths, work);
  // The child's proof is the parent's for the criteria the task covered: one record per criterion
  // names the task, the child and the commit, so the report leads to the child's own red and green.
  const credit = creditChild(env.paths, work, record, options.forcedBy !== undefined);
  // The child's record, where the merge did not bring it (an item kept local, the logs), then trusted here as the engine's own.
  const childDir = workDir(env.paths, child);
  if (existsSync(workDir(childPaths, child)))
    cpSync(workDir(childPaths, child), childDir, {
      recursive: true,
      force: false,
      errorOnExist: false,
    });
  for (const name of CHILD_RECORD_FILES) recordIntegrity(env.paths, join(childDir, name));
  const kept = removeWorktree(env.paths.root, record.worktree);
  // The record of what opened the implementer normally went with the sweep that settled its
  // session (a merge waits for that), and a start that failed took its own; this drop covers a
  // record left by a crash between its writing and the session's recording in the outbox. The
  // worktree's own canonical root is the record's key.
  if (!kept) dropOpenedMarker(ctx.paths.userDir, childPaths.root);
  // What the merge's own sweep settled or could not, said with the merge: the hooks do not say it again.
  return {
    record,
    commit,
    swept: swept.lines,
    ...(kept ? { worktreeKept: kept.kept } : {}),
    ...credit,
  };
}

/**
 * Credits a merged task's criteria with the child's proof (finding #41): a `merged` record per
 * criterion, keeping any red or green the lead recorded itself. A forced merge credits nothing,
 * since the child was not proven; an evidence file changed outside the engine is left as it is.
 */
function creditChild(
  paths: CrewPaths,
  work: WorkItem,
  record: TaskRecord,
  forced: boolean,
): { credited: string[]; uncredited: string | null } {
  if (forced)
    return { credited: [], uncredited: "a forced merge of an unproven child credits nothing" };
  const loaded = loadEvidence(paths, work.id);
  if (loaded.tampered)
    return {
      credited: [],
      uncredited: `evidence.json of ${work.id} changed outside the engine (crew accept ${work.id}); nothing credited`,
    };
  const merged = {
    task: record.task,
    child: record.child ?? "",
    commit: record.mergeCommit ?? "",
    at: record.mergedAt ?? nowIso(),
  };
  const tdd = loaded.evidence.tdd.map((t) =>
    record.criteria.includes(t.criterion) ? { ...t, merged } : t,
  );
  for (const criterion of record.criteria)
    if (!tdd.some((t) => t.criterion === criterion)) tdd.push({ criterion, merged });
  saveEvidence(paths, work.id, { ...loaded.evidence, tdd });
  return { credited: [...record.criteria], uncredited: null };
}

/**
 * The child's record as its worktree has it now: the item that started from this task's message
 * (any other item the reply names is refused as such, trusted or not), and the engine's own (a
 * record written by hand is refused, so an implementer cannot prove itself). Returns its verdict.
 */
function childRecordVerdict(
  record: TaskRecord,
  child: string,
  childPaths: CrewPaths,
): { verdict: "proven" | "unproven" } | { refused: string } {
  const item = loadWork(childPaths, child);
  if (item.work?.origin?.mail !== record.message)
    return {
      refused: `${record.task}'s reply names ${child} as its child, but that item did not start from message ${record.message}`,
    };
  const evidence = loadEvidence(childPaths, child);
  const changedFile = item.tampered ? "work.json" : evidence.tampered ? "evidence.json" : null;
  if (changedFile)
    return {
      refused: `${record.task}'s child ${child} changed outside the engine in ${record.worktree} (${changedFile}); crew accept ${child} there, then merge`,
    };
  return { verdict: evidence.evidence.verdict };
}

/**
 * What the branch brings to the merge: nothing of the engine's records but the child's own (a path
 * the branch adds, changes, deletes or moves; renames are not followed, so a move names both its
 * paths), and the child's record as it was just checked in the worktree (the branch's tip against
 * the worktree's files, under the child's folder). A branch git cannot compare is a refusal that
 * names it.
 */
function branchContentRefusal(
  record: TaskRecord,
  child: string,
  root: string,
): { refused: string } | null {
  const unreadable = (error: unknown): { refused: string } => ({
    refused: `the branch ${record.branch} cannot be compared with HEAD: ${gitError(error)}; restore the branch, then merge`,
  });
  const own = `.crew/work/${child}/`;
  let changed: string[];
  try {
    changed = gitRun(root, "diff", "--no-renames", "--name-only", `HEAD...${record.branch}`)
      .split("\n")
      .filter(Boolean);
  } catch (error) {
    return unreadable(error);
  }
  const foreign = changed.find((p) => p.startsWith(".crew/") && !p.startsWith(own));
  if (foreign)
    return {
      refused: `the branch ${record.branch} changes ${foreign}, which is not the record of ${record.task}'s child; not merged`,
    };
  let differs: string | undefined;
  try {
    differs = gitRun(
      record.worktree,
      "diff",
      "--no-renames",
      "--name-only",
      record.branch,
      "--",
      own,
    )
      .split("\n")
      .filter(Boolean)[0];
  } catch (error) {
    return unreadable(error);
  }
  if (differs)
    return {
      refused: `${record.task}'s child ${child} differs between the branch ${record.branch} and its worktree ${record.worktree} (${differs.slice(own.length)}); commit the record in the worktree, then merge`,
    };
  return null;
}
