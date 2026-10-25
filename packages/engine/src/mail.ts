import { createHash } from "node:crypto";
import { accessSync, constants, existsSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import { loadEvidence } from "./evidence.ts";
import { nowIso, readJson, readText, writeJson, writeText } from "./fs.ts";
import { COMMAND_LOCK_WAIT_MS, LockBusy, withLock } from "./lock.ts";
import {
  decidedPriority,
  insidePath,
  MAIL_TRANSITIONS,
  type MappedStatus,
  MESSAGE_ID,
  mailStatus,
  priorityOf,
  priorityRank,
  threadOf,
  transition,
} from "./mail-status.ts";
import { resolveOpener } from "./opened.ts";
import {
  type CrewPaths,
  canonical,
  mailboxDir,
  registryPath,
  resolvePaths,
  workDir,
} from "./paths.ts";
import { loadPolicy } from "./policy.ts";
import { oneLine } from "./state.ts";
import {
  readProtectedJson,
  readProtectedJsonAt,
  recordIntegrityAt,
  writeProtectedJson,
  writeProtectedJsonAt,
} from "./store.ts";
import { rolePattern } from "./team.ts";
import {
  type Contract,
  type ContractKind,
  GATE_NAMES,
  isMailPriority,
  MAIL_PRIORITIES,
  type MailAddressee,
  type Mailbox,
  type MailParty,
  type MailPolicy,
  type MailPriority,
  type MailType,
  type Message,
  type OpenedSession,
  type OpenMode,
  type Policy,
  type PriorityDecision,
  type ProjectEntry,
  type Registry,
  type ReplyEvidence,
  type WorkItem,
} from "./types.ts";
import { loadWork } from "./work.ts";
import { gitError, gitRun, gitShow, worktreeMainRoot } from "./worktree.ts";

export {
  decidedPriority,
  MAIL_TRANSITIONS,
  type MappedStatus,
  MESSAGE_ID,
  mailStatus,
  priorityOf,
  readContracts,
  readEvidence,
  threadOf,
  transition,
} from "./mail-status.ts";

/** The shape of a work id of this project (`newWorkId`): a date, a sequence and a slug, never a path. */
const WORK_ID = /^\d{4}-\d{2}-\d{2}-\d{3}-[a-z0-9-]*$/;
/** How much of a child's unproven reasons a reply carries to the sender. */
const REASONS_CHARS = 500;
/** A branch name a contract may be checked at: a conservative ref, never an option, never a range. */
const BRANCH_NAME = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

/** The parties of a thread: the projects and the tasks of its messages, never a role (SP7 §9). */
export function threadParties(messages: readonly Message[], root: string): string[] {
  const parties: string[] = [];
  const key = (p: { project: string; agent: string | null }) =>
    p.agent && TASK_AGENT.test(p.agent) ? `${p.project}/${p.agent}` : p.project;
  for (const m of messages) {
    if (threadOf(m) !== root) continue;
    for (const p of [key(m.from), key(m.to)]) if (!parties.includes(p)) parties.push(p);
  }
  return parties.sort();
}

/** Every message this project's two boxes hold, the inbox first; a box a hand changed holds nothing. */
export function heldMessages(ctx: MailContext): Message[] {
  const dir = mailbox(ctx.paths.userDir, ctx.self.workspace, ctx.self.project).dir;
  const seen = new Set<string>();
  const held: Message[] = [];
  for (const which of ["inbox", "outbox"] as const) {
    const read = readBox(dir, which);
    if (read.tampered) continue;
    for (const m of read.box.messages) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      held.push(m);
    }
  }
  return held;
}

/** The messages of a thread this project holds, oldest first, with its parties; refused for a root no box holds. */
export function threadMessages(
  ctx: MailContext,
  root: string,
): { messages: Message[]; parties: string[] } | { refused: string } {
  const held = heldMessages(ctx);
  if (!MESSAGE_ID.test(root) || !held.some((m) => m.id === root))
    return { refused: `no message ${root} in this project's mail` };
  const messages = held
    .filter((m) => threadOf(m) === root)
    .sort((a, b) => a.at.localeCompare(b.at));
  return { messages, parties: threadParties(messages, root) };
}

/** A contract as `parseContract` reads it from a `--contract` value: no path for a clause. */
interface ParsedContract {
  kind: ContractKind;
  path: string | null;
  summary: string;
}

/** A `--contract` as typed: `<kind>:<path>[:<summary>]`, or `clause:<summary>`; the first colon after the kind ends the path. */
export function parseContract(text: string): ParsedContract | { refused: string } {
  const match = /^(openapi|types|schema|clause):([\s\S]*)$/.exec(text);
  if (!match)
    return {
      refused: `a contract is openapi:<path>, types:<path>, schema:<path> or clause:<summary>, not ${text}`,
    };
  const kind = match[1] as ContractKind;
  const rest = match[2] ?? "";
  if (kind === "clause") return { kind, path: null, summary: rest.trim() };
  const colon = rest.indexOf(":");
  const path = colon === -1 ? rest : rest.slice(0, colon);
  const summary = colon === -1 ? "" : rest.slice(colon + 1).trim();
  if (!insidePath(path))
    return { refused: `contract ${kind}:${path} names a path outside the project` };
  return { kind, path, summary };
}

/**
 * The contracts of a reply checked from the replying project at the branch's tip (SP7 §9): the
 * file is read with `git show`, never from the working tree, and its hash recorded; an openapi or
 * schema file parses or names its format; a types file is in the branch's diff from the child's
 * base commit; a clause has its section in the body. One failed check refuses the whole reply.
 */
export function checkContracts(
  root: string,
  branch: string | undefined,
  base: string | null,
  contracts: readonly ParsedContract[],
  body: string,
): { contracts: Contract[] } | { refused: string } {
  // A contract with a path is checked at a branch's tip: the branch is named, and it is a branch
  // name, never an option or a range, before git runs.
  let tip = "";
  if (contracts.some((c) => c.path !== null)) {
    if (!branch)
      return { refused: "a contract needs --branch <b>: the file is checked at its tip" };
    if (!BRANCH_NAME.test(branch) || branch.includes(".."))
      return { refused: `--branch ${branch} is not a branch name` };
    tip = branch;
  }
  const checked: Contract[] = [];
  let changed: string[] | null = null;
  for (const c of contracts) {
    if (c.kind === "clause") {
      if (!/^## Contracts\s*$/m.test(body))
        return { refused: 'contract clause needs a "## Contracts" section in the reply' };
      checked.push({ kind: c.kind, path: null, hash: null, summary: c.summary });
      continue;
    }
    const path = c.path as string;
    const content = gitShow(root, tip, path);
    if (content === null)
      return { refused: `contract ${c.kind}:${path} is not at the tip of ${tip}` };
    const hash = createHash("sha256").update(content).digest("hex");
    if (c.kind === "openapi" || c.kind === "schema") {
      const text = content.toString("utf8");
      if (path.endsWith(".json")) {
        try {
          JSON.parse(text);
        } catch {
          return { refused: `contract ${c.kind}:${path} does not parse as JSON` };
        }
      } else if (!text.trim() || !/^(openapi|swagger|\$schema)\s*:/m.test(text)) {
        return { refused: `contract ${c.kind}:${path} has no openapi, swagger or $schema line` };
      }
    } else {
      if (!base)
        return {
          refused: `contract types:${path} cannot be checked: the child has no base commit`,
        };
      if (changed === null) {
        // A diff git cannot give is named as such, never read as a path outside it (finding 69).
        try {
          changed = gitRun(root, "diff", "--name-only", "--end-of-options", base, tip)
            .split("\n")
            .filter(Boolean);
        } catch (error) {
          return {
            refused: `contract types:${path} cannot be checked: git diff failed (${gitError(error)})`,
          };
        }
      }
      if (!changed.includes(path))
        return { refused: `contract types:${path} is not in the child's diff` };
    }
    checked.push({ kind: c.kind, path, hash, summary: c.summary });
  }
  return { contracts: checked };
}

/** The refusal of a priority that is not one of the four, before any record. */
export function badPriority(value: unknown): string {
  return `priority is one of ${MAIL_PRIORITIES.join(", ")}, not ${String(value)}`;
}

/** A project is live when a hook or a command ran in it within this long (SP2c §6). */
export const LIVE_MS = 10 * 60 * 1000;
/** A body under this many bytes travels in the message; a longer one lives beside the inbox. */
export const INLINE_BODY_LIMIT = 2048;
const PREVIEW_CHARS = 200;
const SUBJECT_CHARS = 80;
/** A role of the plugin as a message names it, from the registry (`expert-<n>` numbered); one source with the hook and hooks.json (SP7a). */
export const ROLE_AGENT = rolePattern();
export const TASK_AGENT = /^T-\d+$/;
const CRITICS = new Set(["devils-advocate", "fault-finder"]);

/** Who this engine is in the mail: its workspace, its name, the agent it speaks as, and how far from a first message it is. */
export interface MailSelf {
  workspace: string | null;
  project: string;
  agent: string;
  hops: number;
  /** The message that opened this session, when one did (`resolveOpener`: the variables, narrowed by the engine's record). */
  openedBy: string | null;
  /** How the opener let the session act, when one did. */
  openedMode: OpenMode | null;
  /** The one branch the opener let the session push, from the hook's variables alone. */
  openedBranch: string | null;
}

export interface MailContext {
  paths: CrewPaths;
  policy: Policy;
  env: NodeJS.ProcessEnv;
  self: MailSelf;
}

/**
 * The mail policy that governs a checkout: its own, except that a worktree whose checkout does not
 * carry `mail.name` or `mail.workspace` yet (not committed) takes them from its main checkout, so
 * the worktree shares its project's mailbox (plan decision 7). `main` is that checkout, or null.
 */
function effectiveMailPolicy(
  root: string,
  policy: Policy,
  env: NodeJS.ProcessEnv,
): { mail: MailPolicy; main: string | null } {
  const main = worktreeMainRoot(root);
  let mail = policy.mail;
  if (main && (mail.name === null || mail.workspace === null)) {
    const mainPaths = resolvePaths(main, env);
    const theirs = mainPaths ? loadPolicy(mainPaths).policy.mail : null;
    if (theirs)
      mail = {
        ...mail,
        name: mail.name ?? theirs.name,
        workspace: mail.workspace ?? theirs.workspace,
      };
  }
  return { mail, main };
}

/** A subject as data in a line the agent reads: control characters gone, in quotes, so another project's words are never the engine's voice. */
export function subjectQuoted(subject: string): string {
  return JSON.stringify(subject.replace(/\p{Cc}+/gu, " ").trim());
}

/** Who this checkout is in the mail. The project's name is the governing policy's `mail.name`, else the folder's (the main checkout's, for a worktree): the one naming rule, read everywhere through `ctx.self.project`. */
export function mailSelf(paths: CrewPaths, policy: Policy, env: NodeJS.ProcessEnv): MailSelf {
  // What opened this session: the variables, narrowed by the engine's record of the checkout
  // (security review of SP2c task 4, rounds 4 and 5; `resolveOpener` says the rule once).
  const opener = resolveOpener(paths, env);
  const { mail, main } = effectiveMailPolicy(paths.root, policy, env);
  return {
    workspace: mail.workspace,
    project: mail.name ?? basename(main ?? paths.root),
    agent: opener.agent,
    hops: opener.hops,
    openedBy: opener.mail,
    openedMode: opener.mode,
    openedBranch: opener.branch,
  };
}

export function mailContext(paths: CrewPaths, policy: Policy, env: NodeJS.ProcessEnv): MailContext {
  return { paths, policy, env, self: mailSelf(paths, policy, env) };
}

// ---------------------------------------------------------------------------------------------
// The registry

export function loadRegistry(userDir: string): Registry {
  const raw = readJson<Partial<Registry>>(registryPath(userDir));
  const projects = Array.isArray(raw?.projects)
    ? raw.projects.filter(
        (p): p is ProjectEntry =>
          typeof p === "object" &&
          p !== null &&
          typeof p.root === "string" &&
          typeof p.name === "string",
      )
    : [];
  return { version: 1, projects };
}

function saveRegistry(userDir: string, registry: Registry): void {
  writeJson(registryPath(userDir), registry);
}

/** The main checkout registered under a name in a workspace (`_alone` in a message is the null workspace). */
function projectEntry(
  registry: Registry,
  workspace: string | null,
  name: string,
): ProjectEntry | undefined {
  const ws = workspace === "_alone" ? null : workspace;
  return registry.projects.find((p) => p.name === name && p.workspace === ws && !p.worktreeOf);
}

/** Whether a time a record carries is within `ms` of `now`; an absent or unreadable time never is. */
function seenWithin(at: string | undefined, ms: number, now: number): boolean {
  const seen = at === undefined ? Number.NaN : Date.parse(at);
  return Number.isFinite(seen) && now - seen <= ms;
}

/** Live means a session's hook ran here within `LIVE_MS`; a command's registration never counts (SP2c 8a, finding #39). */
export function isLive(entry: ProjectEntry, now = Date.now()): boolean {
  return seenWithin(entry.lastHook, LIVE_MS, now);
}

/**
 * Records this project in the registry: its root, its name, its workspace, when it was last seen
 * and by which session; a worktree names its main checkout and the message that opened it. With
 * `minIntervalMs`, an entry seen more recently than that is left as it is (a tool call does not
 * pay a write each time; decision 3 of the plan). `hook` marks the entry as live: only a session's
 * hook gives it, so a command typed in a project (`crew detect` included) never makes it live, and
 * a hook's first mark is written even within the interval.
 */
export function registerProject(
  ctx: MailContext,
  sessionId: string,
  options: { minIntervalMs?: number; hook?: boolean } = {},
): ProjectEntry {
  const registry = loadRegistry(ctx.paths.userDir);
  const existing = registry.projects.find((p) => p.root === ctx.paths.root);
  const recent = (at: string | undefined): boolean =>
    options.minIntervalMs !== undefined && seenWithin(at, options.minIntervalMs, Date.now());
  if (
    existing &&
    recent(existing.lastSeen) &&
    existing.sessionId === sessionId &&
    (!options.hook || recent(existing.lastHook))
  )
    return existing;
  const main = worktreeMainRoot(ctx.paths.root);
  const now = nowIso();
  const lastHook = options.hook ? now : existing?.lastHook;
  const entry: ProjectEntry = {
    root: ctx.paths.root,
    name: ctx.self.project,
    workspace: ctx.self.workspace,
    lastSeen: now,
    sessionId,
    ...(lastHook ? { lastHook } : {}),
    ...(main ? { worktreeOf: main } : {}),
    ...(ctx.self.openedBy ? { mail: ctx.self.openedBy } : {}),
  };
  registry.projects = [...registry.projects.filter((p) => p.root !== entry.root), entry];
  saveRegistry(ctx.paths.userDir, registry);
  return entry;
}

/** Takes out the entries whose root no longer exists; returns the roots removed. */
export function pruneRegistry(userDir: string): string[] {
  const registry = loadRegistry(userDir);
  const gone = registry.projects.filter((p) => !existsSync(p.root)).map((p) => p.root);
  if (gone.length) {
    registry.projects = registry.projects.filter((p) => existsSync(p.root));
    saveRegistry(userDir, registry);
  }
  return gone;
}

/**
 * The project a name means, within the sender's workspace and nowhere else (SP2c §6): `.` is the
 * sender itself; a project with no workspace knows only itself; a name of another workspace is
 * refused with the workspace it is in, so the refusal says what happened without hinting at a way
 * across. Worktrees are never the destination of a name: the main checkout is. `toSelf` says
 * whether that checkout is the sender's own, from the one reading of its main root.
 */
export function resolveProject(
  ctx: MailContext,
  to: string,
): { entry: ProjectEntry; toSelf: boolean } | { refused: string } {
  const registry = loadRegistry(ctx.paths.userDir);
  const main = worktreeMainRoot(ctx.paths.root) ?? ctx.paths.root;
  if (to === "." || to === ctx.self.project) {
    // A lookup never writes: with no entry yet (rare, since every command registers), the sender
    // is known from its own context, and the entry is not saved.
    const own = registry.projects.find((p) => p.root === main) ?? {
      root: main,
      name: ctx.self.project,
      workspace: ctx.self.workspace,
      lastSeen: nowIso(),
      sessionId: "",
    };
    return { entry: own, toSelf: true };
  }
  if (ctx.self.workspace === null) {
    return {
      refused:
        "this project has no workspace (crew policy set mail.workspace <name>); it can only mail itself (--to .)",
    };
  }
  const candidates = registry.projects.filter((p) => p.name === to && !p.worktreeOf);
  const inWorkspace = candidates.filter((p) => p.workspace === ctx.self.workspace);
  const alive = inWorkspace.filter((p) => existsSync(p.root));
  if (alive.length) {
    // The most recently seen one, when a name was registered from two roots.
    alive.sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
    const entry = alive[0] as ProjectEntry;
    return { entry, toSelf: entry.root === main };
  }
  const where = `in workspace ${ctx.self.workspace}`;
  if (inWorkspace.length) {
    return {
      refused: `no project named ${to} ${where}; the registry knew one at ${inWorkspace[0]?.root}, which is gone`,
    };
  }
  const elsewhere = candidates.find((p) => p.workspace !== null);
  if (elsewhere) {
    return {
      refused: `${to} is not in workspace ${ctx.self.workspace} (it is in ${elsewhere.workspace}); mail never leaves the workspace`,
    };
  }
  if (candidates.length) {
    return {
      refused: `${to} is not in workspace ${ctx.self.workspace} (it has no workspace); mail never leaves the workspace`,
    };
  }
  const known = [
    ...new Set(
      registry.projects
        .filter((p) => p.workspace === ctx.self.workspace && !p.worktreeOf)
        .map((p) => p.name),
    ),
  ].sort();
  return { refused: `no project named ${to} ${where} (known: ${known.join(", ") || "none"})` };
}

// ---------------------------------------------------------------------------------------------
// The mailbox files

/** A project's mailbox folder: the inbox, the outbox, their integrity file, the long bodies and the opened sessions' logs live in it. */
export function mailbox(
  userDir: string,
  workspace: string | null,
  project: string,
): { dir: string } {
  return { dir: mailboxDir(userDir, workspace, project) };
}

/** The JSON files of a mailbox folder, named once. */
function boxFile(dir: string, name: "inbox" | "outbox" | "integrity"): string {
  return join(dir, `${name}.json`);
}

export function readBox(
  dir: string,
  which: "inbox" | "outbox",
): { box: Mailbox; tampered: boolean } {
  // A box that exists and cannot be read is an error, never an empty box: nothing is counted,
  // swept or allowed from what could not be read (test-quality review of SP2c task 4, round 16).
  const file = boxFile(dir, which);
  if (existsSync(file)) accessSync(file, constants.R_OK);
  const read = readProtectedJsonAt<Mailbox>(boxFile(dir, "integrity"), file);
  const box: Mailbox =
    read.data && Array.isArray(read.data.messages) ? read.data : { version: 1, messages: [] };
  return { box, tampered: read.tampered };
}

export function writeBox(dir: string, which: "inbox" | "outbox", box: Mailbox): void {
  writeProtectedJsonAt(boxFile(dir, "integrity"), boxFile(dir, which), box);
}

/** The mailbox's lock: `withLock` on the mailbox folder, reported as the mailbox. */
export function withMailLock<T>(dir: string, fn: () => T, options: { waitMs?: number } = {}): T {
  return withLock(dir, fn, { ...options, what: "mailbox" });
}

/**
 * The user's acceptance of this project's own box after a hand edit (`crew accept mail`): its
 * current content recorded as the engine's, read and recorded under the mailbox's lock so no writer
 * changes it meanwhile, with the messages it now holds for the user to see what was signed. The
 * box is the one `ctx.self` names; nothing reaches another project's. A project with no mail
 * identity (no `mail.name` nor `mail.workspace` in the governing policy) has no box to accept.
 */
export function acceptBox(
  ctx: MailContext,
  which: "inbox" | "outbox",
): { file: string; messages: Message[] } | { refused: string } {
  const { mail } = effectiveMailPolicy(ctx.paths.root, ctx.policy, ctx.env);
  if (mail.name === null && mail.workspace === null)
    return {
      refused:
        "this project has no mail identity (crew policy set mail.workspace <name>); it has no mailbox to accept",
    };
  const dir = mailbox(ctx.paths.userDir, ctx.self.workspace, ctx.self.project).dir;
  const file = boxFile(dir, which);
  try {
    return withMailLock(dir, () => {
      // Read once and parsed first (triage 4j): a box that is not a mailbox is never trusted, and
      // the integrity recorded is the hash of the very bytes that were parsed.
      const text = readText(file);
      if (text === null) return { refused: `no ${which} at ${file} to accept` };
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return { refused: `${which} not accepted: ${file} is not valid JSON` };
      }
      const messages = (parsed as Partial<Mailbox> | null)?.messages;
      if (!Array.isArray(messages))
        return { refused: `${which} not accepted: ${file} is not a mailbox (no messages array)` };
      recordIntegrityAt(boxFile(dir, "integrity"), file, text);
      return { file, messages: messages as Message[] };
    });
  } catch (error) {
    if (!(error instanceof LockBusy)) throw error;
    return { refused: `${which} not accepted: ${error.message}` };
  }
}

/** `M-<day>-<nnn>-<project>`: the sequence counts the sender's messages of that day (plan decision 1). */
export function newMessageId(outbox: Mailbox, project: string, at: string): string {
  const day = at.slice(0, 10);
  const taken = outbox.messages
    .filter((m) => m.at.slice(0, 10) === day)
    .map((m) => Number(/^M-\d{4}-\d{2}-\d{2}-(\d{3})-/.exec(m.id)?.[1]))
    .filter(Number.isFinite);
  const next = taken.length ? Math.max(...taken) + 1 : 1;
  return `M-${day}-${String(next).padStart(3, "0")}-${project}`;
}

// ---------------------------------------------------------------------------------------------
// The item's copy

export function itemMailPath(paths: CrewPaths, id: string): string {
  return join(workDir(paths, id), "mail.json");
}

export function loadItemMail(paths: CrewPaths, id: string): { box: Mailbox; tampered: boolean } {
  const read = readProtectedJson<Mailbox>(paths, itemMailPath(paths, id));
  return { box: read.data ?? { version: 1, messages: [] }, tampered: read.tampered };
}

/** The message as the item last knew it: added, or replaced by its newer state. */
export function recordInItem(paths: CrewPaths, id: string, message: Message): void {
  if (!existsSync(join(workDir(paths, id), "work.json"))) return;
  const { box, tampered } = loadItemMail(paths, id);
  if (tampered) return; // never pass a hand edit off as the engine's own
  box.messages = [...box.messages.filter((m) => m.id !== message.id), message].sort((a, b) =>
    a.at.localeCompare(b.at),
  );
  writeProtectedJson(paths, itemMailPath(paths, id), box);
}

/**
 * Where an item of a party lives: the party's project root as the registry names it when the item
 * is there, else this checkout (`here`), else nowhere. A task's child runs in a worktree of the
 * lead's project: the lead's item is at the project's root and the child's own in the worktree, so
 * the child's commits carry nothing of the lead's record to the merge (SP2c §7).
 */
function itemHome(
  ctx: MailContext,
  registry: Registry,
  party: { workspace: string; project: string },
  item: string,
  here: CrewPaths,
): CrewPaths | null {
  const root = projectEntry(registry, party.workspace, party.project)?.root;
  const registered = root ? resolvePaths(root, ctx.env) : null;
  for (const paths of [registered, here]) {
    if (paths && existsSync(join(workDir(paths, item), "work.json"))) return paths;
  }
  return null;
}

/** A message's copy in each item it names, each where that item lives. */
function recordForParties(
  ctx: MailContext,
  registry: Registry,
  m: Message,
  here: CrewPaths = ctx.paths,
): void {
  const copies: [string | null, { workspace: string; project: string }][] = [
    [m.from.item, m.from],
    [m.to.item, m.to],
  ];
  for (const [item, party] of copies) {
    if (!item) continue;
    const home = itemHome(ctx, registry, party, item, here);
    if (home) recordInItem(home, item, m);
  }
}

// ---------------------------------------------------------------------------------------------
// Sending

export interface SendRequest {
  to: string;
  agent?: string;
  type: MailType;
  /** The sender's proposal (SP7 §9); `normal` when absent, `blocker` for a blocker. */
  priority?: MailPriority;
  /** The root of the thread this message joins (SP7 §9): a message this project's boxes hold. */
  thread?: string;
  subject?: string;
  text: string;
  filePath?: string;
  item?: string;
  replyTo?: string;
}

export type Delivery =
  | { kind: "live"; entry: ProjectEntry }
  | { kind: "open"; mode: OpenMode; entry: ProjectEntry }
  | { kind: "queued"; reason: string }
  | { kind: "self" };

/** One line of at most SUBJECT_CHARS: a given subject, else the text's first line; whitespace runs folded, never a newline. */
function subjectOf(request: { subject?: string; text: string }): string {
  const given = request.subject?.replace(/\s+/g, " ").trim();
  if (given) return given.slice(0, SUBJECT_CHARS);
  const first = request.text.split("\n").find((l) => l.trim()) ?? "";
  return first.length > SUBJECT_CHARS - 3 ? `${first.slice(0, SUBJECT_CHARS - 3)}...` : first;
}

/** The destination's policy, read as its engine would; null when the root is not a crew project. */
export function destinationPolicy(
  entry: ProjectEntry,
  env: NodeJS.ProcessEnv,
): { policy: Policy; tampered: boolean } | null {
  const paths = resolvePaths(entry.root, env);
  return paths ? loadPolicy(paths) : null;
}

/** The sessions open in a destination: messages in its inbox with a session started and not ended (the tasks it opened for itself included). */
export function openIn(userDir: string, workspace: string | null, project: string): number {
  const { box } = readBox(mailbox(userDir, workspace, project).dir, "inbox");
  return box.messages.filter((m) => m.opened && !m.opened.endedAt).length;
}

/** Writes a body: in the message under the limit; beside the receiver's inbox as `<id>.md` otherwise, with a preview in the message. */
function placeBody(dir: string, id: string, text: string): { body: string; bodyFile?: string } {
  if (Buffer.byteLength(text, "utf8") <= INLINE_BODY_LIMIT) return { body: text };
  const file = join(dir, `${id}.md`);
  writeText(file, text);
  return { body: `${text.slice(0, PREVIEW_CHARS)}...`, bodyFile: file };
}

function party(self: MailSelf, item: string | null): MailParty {
  return { workspace: self.workspace ?? "_alone", project: self.project, item, agent: self.agent };
}

/** The text of a message with `--file` appended when given: resolved against the root, refused when missing. */
function attachFile(
  root: string,
  text: string,
  filePath: string | undefined,
): { text: string } | { refused: string } {
  if (!filePath) return { text };
  const abs = isAbsolute(filePath) ? filePath : resolve(root, filePath);
  const content = readText(abs);
  if (content === null) return { refused: `no file at ${abs}` };
  return { text: text.trim() ? `${text.trim()}\n\n${content}` : content };
}

/** The refusal for a box a hand changed: the engine neither reads it as its own nor writes it. */
export function tamperedBox(owner: string, which: "inbox" | "outbox"): string {
  return `${owner}'s ${which} changed outside the engine; files under the user's crew directory are written only by the crew command`;
}

/**
 * Appends a message to a box under the mailbox's lock; `build` gets the box as read, so an id can
 * be counted from it. A box changed outside the engine is left as the hand left it and the write
 * refused: the one tamper rule, as `recordInItem`, `updateEverywhere` and `syncMail` keep it.
 * `waitMs` is how long a held lock is waited for: a command passes `COMMAND_LOCK_WAIT_MS`, a hook
 * keeps the lock's default.
 */
function appendToBox(
  dir: string,
  which: "inbox" | "outbox",
  owner: string,
  build: (box: Mailbox) => Message,
  waitMs?: number,
): Message | { refused: string } {
  return withMailLock(
    dir,
    (): Message | { refused: string } => {
      const { box, tampered } = readBox(dir, which);
      if (tampered) return { refused: tamperedBox(owner, which) };
      const message = build(box);
      box.messages.push(message);
      writeBox(dir, which, box);
      return message;
    },
    { waitMs },
  );
}

/** A message of this project's outbox: from this agent and the item, at its time and its hops, opening no session; `fields` carries the rest. */
function outboxMessage(
  self: MailSelf,
  itemId: string | null,
  at: string,
  fields: Omit<Message, "at" | "from" | "hops" | "opened"> & { from?: MailParty },
): Message {
  return { at, from: party(self, itemId), hops: self.hops, opened: null, ...fields };
}

/**
 * Why `--agent` cannot address what it names (SP2c §7), or null: a role or a task of this project
 * only; the judge hears from the lead; a critic receives the item's proposals and nothing else; a
 * task is one of the item's.
 */
function agentRefusal(
  ctx: MailContext,
  request: SendRequest,
  to: { name: string; toSelf: boolean; itemId: string | null; work: WorkItem | null },
): string | null {
  const { name, toSelf, itemId, work } = to;
  const agent = request.agent;
  if (!agent) return null;
  if (!toSelf)
    return `--agent addresses a role or a task of this project; ${name} is another project`;
  if (ROLE_AGENT.test(agent)) {
    if (agent === "judge" && ctx.self.agent !== "session")
      return `a message to the judge comes from the lead (session), not from ${ctx.self.agent}`;
    if (CRITICS.has(agent)) {
      const proposals = itemId ? `.crew/work/${itemId}/conclave/proposals.md` : null;
      const given = request.filePath ? canonical(resolve(ctx.paths.root, request.filePath)) : null;
      if (
        !proposals ||
        !given ||
        given !== canonical(join(ctx.paths.root, proposals)) ||
        request.text.trim()
      )
        return `a message to ${agent} carries ${proposals ?? ".crew/work/<id>/conclave/proposals.md"} (--file) and nothing else`;
    }
    return null;
  }
  if (TASK_AGENT.test(agent)) {
    if (!(work?.tasks ?? []).some((t) => t.task === agent))
      return `${agent} is not a task of ${work?.id ?? "the active item"} (crew task <id> open ${agent} …)`;
    return null;
  }
  if (agent !== "session") return `--agent is session, a task (T-n) or a role, not ${agent}`;
  return null;
}

/**
 * Sends a message under the rules of SP2c §6, in their order, before anything is written: the
 * destination is in the sender's workspace; its policy accepts the type; the hops are under its
 * limit; a session, when one would open, is allowed and under the limit. A refusal is recorded in
 * the sender's outbox and the item's copy, never in any inbox. Mail to a role or a task of the
 * same project (`--to .`) obeys the addressing rules of §7 and is recorded as relayed for a role.
 */
export function send(
  ctx: MailContext,
  request: SendRequest,
  work: WorkItem | null,
): { message: Message; delivery: Delivery } | { refused: string; message: Message | null } {
  const at = nowIso();
  const self = ctx.self;
  const own = mailbox(ctx.paths.userDir, self.workspace, self.project);
  const itemId = request.item ?? work?.id ?? null;
  const attached = attachFile(ctx.paths.root, request.text, request.filePath);
  if ("refused" in attached) return { refused: attached.refused, message: null };
  const text = attached.text;
  if (!text.trim()) return { refused: "a message needs a text (or --file)", message: null };
  if (request.priority !== undefined && !isMailPriority(request.priority))
    return { refused: badPriority(request.priority), message: null };
  // The message is built here from the request's fields alone: it arrives sent, undecided.
  const priority: MailPriority =
    request.priority ?? (request.type === "blocker" ? "blocker" : "normal");
  // A thread joins projects and tasks (SP7 §9): the root is a message this project holds, a role
  // never a party, and the cap is the sender's policy's; a refusal here records nothing.
  let root: Message | null = null;
  if (request.thread !== undefined) {
    if (request.agent && ROLE_AGENT.test(request.agent))
      return { refused: "a thread joins projects and tasks, never roles", message: null };
    const held = heldMessages(ctx);
    root = (MESSAGE_ID.test(request.thread) && held.find((m) => m.id === request.thread)) || null;
    if (!root)
      return { refused: `no message ${request.thread} in this project's mail`, message: null };
  }
  const resolved = resolveProject(ctx, request.to);
  // The subject, the thread's root quoted when the message joins one and gives none of its own.
  const subject = subjectOf({
    subject: request.subject ?? (root ? subjectQuoted(root.subject) : undefined),
    text,
  });
  // A refusal is recorded in the sender's outbox; when that outbox is itself tampered, nothing is.
  const refuse = (
    reason: string,
    to: MailAddressee,
  ): { refused: string; message: Message | null } => {
    const written = appendToBox(
      own.dir,
      "outbox",
      self.project,
      (box) =>
        outboxMessage(self, itemId, at, {
          id: newMessageId(box, self.project, at),
          to,
          type: request.type,
          priority,
          ...(root ? { thread: root.id } : {}),
          subject,
          body: text.slice(0, PREVIEW_CHARS),
          replyTo: request.replyTo ?? null,
          status: "refused",
          reason,
        }),
      COMMAND_LOCK_WAIT_MS,
    );
    if ("refused" in written) return { refused: written.refused, message: null };
    if (itemId) recordInItem(ctx.paths, itemId, written);
    return { refused: reason, message: written };
  };
  const unknownTo: MailAddressee = {
    workspace: self.workspace ?? "_alone",
    project: request.to,
    item: null,
    agent: request.agent ?? null,
  };
  if ("refused" in resolved) return refuse(resolved.refused, unknownTo);
  const entry = resolved.entry;
  if (root) {
    const parties = threadParties(heldMessages(ctx), root.id);
    const joining =
      request.agent && TASK_AGENT.test(request.agent)
        ? `${entry.name}/${request.agent}`
        : entry.name;
    const cap = ctx.policy.mail.maxParties;
    if (!parties.includes(joining) && parties.length >= cap)
      return {
        refused: `thread ${root.id} has ${parties.length} parties (mail.maxParties ${cap}); ${joining} cannot join`,
        message: null,
      };
  }
  const toSelf = resolved.toSelf;
  const to: MailAddressee = {
    workspace: self.workspace ?? "_alone",
    project: entry.name,
    item: null,
    agent: request.agent ?? null,
  };
  const agentRefused = agentRefusal(ctx, request, {
    name: entry.name,
    toSelf,
    itemId,
    work,
  });
  if (agentRefused) return refuse(agentRefused, to);
  const relayed = request.agent !== undefined && ROLE_AGENT.test(request.agent);
  const destination = destinationPolicy(entry, ctx.env);
  if (!destination)
    return refuse(`${entry.name} at ${entry.root} is not a crew project any more`, to);
  if (destination.tampered)
    return refuse(
      `${entry.name}'s policy changed outside the engine; its user accepts it with crew policy accept`,
      to,
    );
  const rules = destination.policy.mail;
  if (!toSelf && !rules.accept.includes(request.type))
    return refuse(
      `${entry.name} does not accept ${request.type} (its policy accepts ${rules.accept.join(", ")})`,
      to,
    );
  if (!request.replyTo && self.hops >= rules.maxHops && self.openedBy)
    return refuse(
      `this session is ${self.hops} hops from the first message and ${entry.name} allows ${rules.maxHops} (mail.maxHops); only a reply may go out`,
      to,
    );
  // A destination inbox a hand changed takes nothing: refused before the message exists, and
  // before its sessions are counted from that inbox.
  const dest = mailbox(ctx.paths.userDir, entry.workspace, entry.name);
  if (readBox(dest.dir, "inbox").tampered) return refuse(tamperedBox(entry.name, "inbox"), to);
  // Where the message goes next.
  let delivery: Delivery;
  if (toSelf) delivery = { kind: "self" };
  else if (isLive(entry)) delivery = { kind: "live", entry };
  else if (request.type === "notice")
    delivery = { kind: "queued", reason: "a notice waits in the inbox" };
  else if (request.type === "change-request" && rules.open !== "branch")
    delivery = {
      kind: "queued",
      reason: `${entry.name} accepts change requests only with a person present (mail.open is read-only)`,
    };
  else {
    const mode: OpenMode = request.type === "question" ? "read-only" : rules.open;
    const open = openIn(ctx.paths.userDir, entry.workspace, entry.name);
    if (open >= rules.maxConcurrent)
      return refuse(
        `${entry.name} has ${open} session${open === 1 ? "" : "s"} open (mail.maxConcurrent ${rules.maxConcurrent}); try again when one ends`,
        to,
      );
    delivery = { kind: "open", mode, entry };
  }
  // The sender's outbox gives the id; the receiver's inbox gets the record; the item keeps its copy.
  const message = appendToBox(
    own.dir,
    "outbox",
    self.project,
    (outbox) => {
      const id = newMessageId(outbox, self.project, at);
      return outboxMessage(self, itemId, at, {
        id,
        to,
        type: request.type,
        priority,
        ...(root ? { thread: root.id } : {}),
        subject,
        ...placeBody(dest.dir, id, text),
        replyTo: request.replyTo ?? null,
        status: "sent",
        ...(relayed ? { relayed: true } : {}),
      });
    },
    COMMAND_LOCK_WAIT_MS,
  );
  if ("refused" in message) return { refused: message.refused, message: null };
  const failed = deliver(ctx, dest.dir, entry.name, message, COMMAND_LOCK_WAIT_MS);
  if (failed)
    return {
      refused: failed.refused,
      message: { ...message, status: "refused", reason: failed.refused },
    };
  if (itemId) recordInItem(ctx.paths, itemId, message);
  return { message, delivery };
}

/**
 * Puts a message already in the sender's outbox into a destination inbox. When that inbox changed
 * under a hand between the sender's check and this write, the outbox copy is marked refused and
 * the refusal returned; null when delivered. `waitMs` is the sender's wait for the inbox's lock.
 */
function deliver(
  ctx: MailContext,
  dir: string,
  owner: string,
  message: Message,
  waitMs?: number,
): { refused: string } | null {
  const delivered = appendToBox(dir, "inbox", owner, () => message, waitMs);
  if (!("refused" in delivered)) return null;
  const reason = delivered.refused;
  const skipped: string[] = [];
  updateEverywhere(
    ctx,
    message.id,
    (m) => ({ ...m, status: "refused", reason }),
    (w) => skipped.push(w),
  );
  return {
    refused: skipped.length ? `${reason}; a copy was not marked: ${skipped.join(", ")}` : reason,
  };
}

/**
 * Records the session a message opened on every copy of it. Returns the message, or null when the
 * opener's own outbox did not take the record (it changed outside the engine); throws `LockBusy`
 * when that outbox was busy past the lock's wait: the sweep, the stop and the listing read that
 * copy, so a session it does not carry would run unseen by them.
 */
export function recordOpened(
  ctx: MailContext,
  id: string,
  opened: OpenedSession,
  skipped: (what: string) => void,
): Message | null {
  const pass = recordEverywhere(ctx, id, (m) => ({ ...m, opened }), skipped);
  if (pass.ownBusy) throw new LockBusy(pass.ownBusy);
  const result = pass.changed;
  const own = readBox(
    mailbox(ctx.paths.userDir, ctx.self.workspace, ctx.self.project).dir,
    "outbox",
  );
  const copy = own.box.messages.find((m) => m.id === id);
  return result && !own.tampered && copy?.opened?.pid === opened.pid ? result : null;
}

/**
 * The one place a message's state changes: the inbox it sits in, the outbox it left, the item that
 * sent or received it. Each copy is changed under its box's lock from its own state, which the
 * engine keeps equal across the copies (every change goes through here). Returns the first copy
 * changed, or null when none was.
 */
export function updateEverywhere(
  ctx: MailContext,
  id: string,
  change: (m: Message) => Message,
  skipped: (what: string) => void,
): Message | null {
  return recordEverywhere(ctx, id, change, skipped).changed;
}

/**
 * `updateEverywhere`'s pass, with what a caller that takes success from it needs: a box busy past
 * the lock's wait is skipped and named like a box that cannot be read, and the pass goes on with
 * the others (finding 30); `ownBusy` is the lock's message when that box is this project's own, a
 * copy the caller could not write.
 */
function recordEverywhere(
  ctx: MailContext,
  id: string,
  change: (m: Message) => Message,
  skipped: (what: string) => void,
): { changed: Message | null; ownBusy: string | null } {
  let result = null as Message | null;
  let ownBusy = null as string | null;
  const ownDir = mailbox(ctx.paths.userDir, ctx.self.workspace, ctx.self.project).dir;
  const registry = loadRegistry(ctx.paths.userDir);
  const boxes = new Set<string>();
  for (const p of registry.projects) {
    if (!p.worktreeOf) boxes.add(mailbox(ctx.paths.userDir, p.workspace, p.name).dir);
  }
  boxes.add(ownDir);
  // The boxes that hold a copy, found first without a lock: a box that cannot be read is skipped
  // and named to the caller, never a reason to stop the pass before the other copies (risk review
  // of SP2c task 4, round 17), and a box that holds no copy is never locked.
  const holding: [string, "inbox" | "outbox"][] = [];
  for (const dir of boxes) {
    for (const which of ["inbox", "outbox"] as const) {
      if (!existsSync(boxFile(dir, which))) continue;
      try {
        if (readBox(dir, which).box.messages.some((m) => m.id === id)) holding.push([dir, which]);
      } catch (error) {
        skipped(`${boxFile(dir, which)} (${(error as Error).message.split("\n")[0]})`);
      }
    }
  }
  // Each holding copy under its box's lock, re-read there: a box that changed outside the engine
  // or cannot be read by then is skipped and named like the others, never written over.
  for (const [dir, which] of holding) {
    try {
      const changed = recordInBox(dir, which, id, change, skipped);
      result = result ?? changed;
    } catch (error) {
      if (!(error instanceof LockBusy)) throw error;
      skipped(`${boxFile(dir, which)} (${error.message})`);
      if (dir === ownDir) ownBusy = error.message;
    }
  }
  // A pass that could not write this project's own copy fails its caller: no item copy records a
  // change the own box lacks (triage 4a).
  if (result && !ownBusy) recordForParties(ctx, registry, result);
  return { changed: result, ownBusy };
}

/**
 * One holding copy changed under its box's lock (triage 4d), the box re-read there: a box that
 * changed outside the engine or cannot be read by then is skipped and named, never written over;
 * a copy gone by then is left. The changed message, or null. A lock held past the wait throws
 * `LockBusy`, for the pass to name.
 */
function recordInBox(
  dir: string,
  which: "inbox" | "outbox",
  id: string,
  change: (m: Message) => Message,
  skipped: (what: string) => void,
): Message | null {
  return withMailLock(dir, () => {
    let read: ReturnType<typeof readBox>;
    try {
      read = readBox(dir, which);
    } catch (error) {
      skipped(`${boxFile(dir, which)} (${(error as Error).message.split("\n")[0]})`);
      return null;
    }
    const { box, tampered } = read;
    if (tampered) {
      skipped(`${boxFile(dir, which)} (changed outside the engine)`);
      return null;
    }
    const index = box.messages.findIndex((m) => m.id === id);
    if (index === -1) return null;
    const changed = change(box.messages[index] as Message);
    box.messages[index] = changed;
    writeBox(dir, which, box);
    return changed;
  });
}

// ---------------------------------------------------------------------------------------------
// Receiving

/** The messages addressed to this project and this agent (`session` reads what names no agent). */
export function ownInbox(ctx: MailContext): { messages: Message[]; tampered: boolean } {
  const { box, tampered } = readBox(
    mailbox(ctx.paths.userDir, ctx.self.workspace, ctx.self.project).dir,
    "inbox",
  );
  // A message that names no agent is the session's. By priority, then age (SP7 §9).
  const mine = box.messages.filter((m) => (m.to.agent ?? "session") === ctx.self.agent);
  return {
    messages: mine.sort(
      (a, b) =>
        priorityRank(decidedPriority(a)) - priorityRank(decidedPriority(b)) ||
        a.at.localeCompare(b.at),
    ),
    tampered,
  };
}

function addressed(ctx: MailContext, m: Message): string | null {
  if (m.to.project !== ctx.self.project)
    return `${m.id} is addressed to ${m.to.project}, not to ${ctx.self.project}`;
  const agent = m.to.agent ?? "session";
  if (agent !== ctx.self.agent && !(ctx.self.agent === "session" && ROLE_AGENT.test(agent)))
    return `${m.id} is addressed to ${agent}, not to ${ctx.self.agent}`;
  return null;
}

/** The message `id` in this agent's inbox, or the refusal: no such message, or an inbox a hand changed. */
function ownMessage(ctx: MailContext, id: string): { found: Message } | { refused: string } {
  const { messages, tampered } = ownInbox(ctx);
  if (tampered) return { refused: tamperedBox(ctx.self.project, "inbox") };
  const found = messages.find((m) => m.id === id);
  return found ? { found } : { refused: `no message ${id} in this inbox` };
}

/** Why the pass left this project's copy unwritten: its box busy past the lock's wait, else changed while it was being written. */
function whyOwnCopyUnwritten(pass: { ownBusy: string | null }): string {
  return pass.ownBusy
    ? `its mailbox is busy (${pass.ownBusy})`
    : "its mailbox changed while it was being written";
}

/** A copy of a message the record pass could not change, as a line for the command's output. */
function skippedLine(id: string): (what: string) => string {
  return (what) => `a copy of ${id} was not changed: ${what}`;
}

/** The message read first when it is still `sent`: a request never moves on unread. */
function readFirst(m: Message, to: MappedStatus, at: string): Message {
  return mailStatus(m) === "sent" && to !== "read"
    ? { ...m, status: "read", readAt: m.readAt ?? at }
    : m;
}

/** The message without the reason a block left on it, once it moves on. */
function withoutReason(m: Message): Message {
  const copy = { ...m };
  delete copy.reason;
  return copy;
}

/**
 * A message moved to `to` along the table (SP7 §9), read first when it is still sent: a block
 * renewed by another unproven reply stays a block with the new fields, and a move to done drops
 * the reason a block left.
 */
function applyMove(
  m: Message,
  to: MappedStatus,
  at: string,
  extra: Partial<Message>,
): Message | { refused: string } {
  const read = readFirst(m, to, at);
  if (to === "blocked" && mailStatus(read) === "blocked") return { ...read, ...extra };
  return transition(to === "done" ? withoutReason(read) : read, to, extra);
}

/**
 * Moves a message of this agent's inbox along the table on every copy: the move of `markRead`,
 * `refuseMail` and `acceptMail` (`reply` moves its original with the same `applyMove`; the opener,
 * the sweep and `approve` set a status through `updateEverywhere`). A move the table refuses is
 * refused before anything is written, a copy it cannot move is left as it is, and a copy of this
 * project's own box left unwritten fails the move.
 */
export function moveMail(
  ctx: MailContext,
  id: string,
  to: MappedStatus,
  extra: Partial<Message>,
  notes: string[],
): Message | { refused: string } {
  const own = ownMessage(ctx, id);
  if ("refused" in own) return own;
  const at = nowIso();
  const check = applyMove(own.found, to, at, extra);
  if ("refused" in check) return check;
  const pass = recordEverywhere(
    ctx,
    id,
    (m) => {
      const moved = applyMove(m, to, at, extra);
      return "refused" in moved ? m : moved;
    },
    (w) => notes.push(skippedLine(id)(w)),
  );
  if (!pass.changed || pass.ownBusy)
    return { refused: `${id} could not be updated: ${whyOwnCopyUnwritten(pass)}` };
  return pass.changed;
}

export function markRead(
  ctx: MailContext,
  id: string,
  notes: string[],
): Message | { refused: string } {
  const own = ownMessage(ctx, id);
  if ("refused" in own) return own;
  if (mailStatus(own.found) !== "sent") return own.found;
  // A notice is done when read; anything else waits for its answer.
  return moveMail(
    ctx,
    id,
    own.found.type === "notice" ? "done" : "read",
    { readAt: nowIso() },
    notes,
  );
}

export function refuseMail(
  ctx: MailContext,
  id: string,
  reason: string,
  notes: string[],
): Message | { refused: string } {
  const own = ownMessage(ctx, id);
  if ("refused" in own) return own;
  const from = mailStatus(own.found);
  if (!MAIL_TRANSITIONS[from].includes("refused"))
    return { refused: `${id} is ${from}; nothing to refuse` };
  if (!reason.trim()) return { refused: 'a refusal needs --reason "<why>"' };
  return moveMail(ctx, id, "refused", { reason: reason.trim() }, notes);
}

/**
 * The receiver's decision on a request's priority (SP7 §9, §10.2): the sender's proposal confirmed
 * at the same level, or lowered with a reason, never raised; a change request or a blocker only (a
 * question is done by its reply, a notice when read). The decision and the move to `accepted` go
 * to every copy; a refusal records nothing.
 */
export function acceptMail(
  ctx: MailContext,
  id: string,
  options: { priority?: MailPriority; reason?: string; by: string },
  notes: string[],
): { message: Message } | { refused: string } {
  const own = ownMessage(ctx, id);
  if ("refused" in own) return own;
  const m = own.found;
  if (m.type === "question")
    return {
      refused: "a question is done by its reply; accept applies to a change request or a blocker",
    };
  if (m.type === "notice")
    return {
      refused: "a notice is done when read; accept applies to a change request or a blocker",
    };
  const from = mailStatus(m);
  if (from !== "sent" && from !== "read")
    return { refused: `${id} is ${from}; accept applies to a request still sent or read` };
  if (options.priority !== undefined && !isMailPriority(options.priority))
    return { refused: badPriority(options.priority) };
  const proposed = priorityOf(m);
  const confirmed = options.priority ?? proposed;
  if (priorityRank(confirmed) < priorityRank(proposed))
    return {
      refused: `${id} was proposed ${proposed}; the receiver confirms or lowers, never raises`,
    };
  const reason = options.reason?.trim() ? oneLine(options.reason) : null;
  if (priorityRank(confirmed) > priorityRank(proposed) && !reason)
    return { refused: 'a lowering needs --reason "<why>"' };
  const decision: PriorityDecision = { proposed, confirmed, by: options.by, reason, at: nowIso() };
  const moved = moveMail(ctx, id, "accepted", { priorityDecision: decision }, notes);
  return "refused" in moved ? moved : { message: moved };
}

/**
 * Answers a message: a new message to its sender with `replyTo`, and the original marked
 * answered. A reply to a change request names the branch and the child item and carries the
 * child's verdict from its evidence. `as` names a role the lead answers for (the hook does this
 * when it saved the role's answer); the reply is then relayed. A reply always passes the hop rule.
 */
export function reply(
  ctx: MailContext,
  id: string,
  text: string,
  options: {
    filePath?: string;
    branch?: string;
    item?: string;
    as?: string;
    /** The `--contract` values as typed, checked at the branch's tip before any record (SP7 §9). */
    contracts?: string[];
  },
  // Where a copy the record pass could not change is named: the command's or the hook's output.
  notes: string[],
): { reply: Message; original: Message } | { refused: string; delivered?: string } {
  const ownDir = mailbox(ctx.paths.userDir, ctx.self.workspace, ctx.self.project).dir;
  const inbox = readBox(ownDir, "inbox");
  if (inbox.tampered) return { refused: tamperedBox(ctx.self.project, "inbox") };
  // A message this project sent sits in its outbox: found there, the refusal says who it was for.
  const original =
    inbox.box.messages.find((m) => m.id === id) ??
    readBox(ownDir, "outbox").box.messages.find((m) => m.id === id);
  if (!original) return { refused: `no message ${id} in this inbox` };
  const wrong = addressed(ctx, original);
  if (wrong) return { refused: wrong };
  // The guards read the mapped status, so a record of an earlier engine version is judged as what it stands for.
  const standing = mailStatus(original);
  if (standing === "done") return { refused: `${id} is done; a second answer is a new message` };
  if (standing === "refused") return { refused: `${id} is refused; it has no answer` };
  if (standing === "expired") return { refused: `${id} is expired; its session is over` };
  if (options.as !== undefined && !ROLE_AGENT.test(options.as))
    return {
      refused:
        "--as names a role: judge, researcher, expert-<n>, devils-advocate, fault-finder or review-<gate>",
    };
  if (options.as && (original.to.agent ?? "session") !== options.as)
    return {
      refused: `${id} is addressed to ${original.to.agent ?? "session"}, not to ${options.as}`,
    };
  // The child's verdict is read from its evidence, never typed (SP2c §7); the id names an item of
  // this project's own work folder, checked before any file is read (security review, SP7b Task 1).
  if (
    options.item !== undefined &&
    (!WORK_ID.test(options.item) || !loadWork(ctx.paths, options.item).work)
  )
    return { refused: `unknown work item: ${options.item}` };
  const child = options.item ? loadEvidence(ctx.paths, options.item).evidence : undefined;
  const verdict = child?.verdict;
  // The contracts as typed, each well-formed, with the branch they are checked at (SP7 §9).
  const typed: ParsedContract[] = [];
  for (const text of options.contracts ?? []) {
    const parsed = parseContract(text);
    if ("refused" in parsed) return parsed;
    typed.push(parsed);
  }
  if (typed.length && !options.item)
    return { refused: "a contract comes with the child item (--item)" };
  // What the reply carries of the child's evidence, read from its records (SP7 §9).
  const carried: ReplyEvidence | undefined =
    options.item && child
      ? {
          report: existsSync(join(workDir(ctx.paths, options.item), "report.md"))
            ? `.crew/work/${options.item}/report.md`
            : null,
          fingerprint: child.fingerprint,
          gatesPassed: [
            ...new Set(child.runs.filter((r) => r.status === "pass").map((r) => r.gate)),
          ].filter((g) => GATE_NAMES.includes(g)),
        }
      : undefined;
  // Where the original lands (SP7 §9): a question or a notice is done by its answer; a request is
  // done only by a proven child, and blocked otherwise, with the reasons the sender will read.
  const closing = original.type === "question" || original.type === "notice";
  const to: MappedStatus = closing || verdict === "proven" ? "done" : "blocked";
  const reason =
    to === "done"
      ? undefined
      : options.item
        ? `unproven: ${(child?.unproven ?? []).map(oneLine).join("; ")}`.slice(0, REASONS_CHARS)
        : "the reply names no child item (--item)";
  const attached = attachFile(ctx.paths.root, text, options.filePath);
  if ("refused" in attached) return { refused: attached.refused };
  const body = attached.text;
  if (!body.trim()) return { refused: "a reply needs a text (or --file)" };
  const checked = checkContracts(
    ctx.paths.root,
    options.branch,
    options.item ? (loadWork(ctx.paths, options.item).work?.baseCommit ?? null) : null,
    typed,
    body,
  );
  if ("refused" in checked) return checked;
  const at = nowIso();
  const own = mailbox(ctx.paths.userDir, ctx.self.workspace, ctx.self.project);
  const dest = mailbox(
    ctx.paths.userDir,
    original.from.workspace === "_alone" ? null : original.from.workspace,
    original.from.project,
  );
  // A message to a role carries the lead's item as `from.item` and no `to.item`; the reply the lead
  // records for the role comes from that same item.
  const from: MailParty = options.as
    ? { ...party(ctx.self, original.to.item ?? original.from.item), agent: options.as }
    : party(ctx.self, original.to.item);
  if (readBox(dest.dir, "inbox").tampered)
    return { refused: tamperedBox(original.from.project, "inbox") };
  const replyMessage = appendToBox(own.dir, "outbox", ctx.self.project, (outbox) => {
    const replyId = newMessageId(outbox, ctx.self.project, at);
    return outboxMessage(ctx.self, original.to.item, at, {
      id: replyId,
      from,
      to: {
        workspace: original.from.workspace,
        project: original.from.project,
        item: original.from.item,
        agent: original.from.agent,
      },
      type: original.type,
      subject: original.subject.startsWith("Re: ") ? original.subject : `Re: ${original.subject}`,
      ...placeBody(dest.dir, replyId, body),
      replyTo: original.id,
      status: "sent",
      ...(options.as || original.relayed ? { relayed: true } : {}),
      ...(options.branch ? { branch: options.branch } : {}),
      ...(options.item ? { item: options.item } : {}),
      ...(verdict ? { verdict } : {}),
      thread: threadOf(original),
      ...(checked.contracts.length ? { contracts: checked.contracts } : {}),
      ...(carried ? { evidence: carried } : {}),
    });
  });
  if ("refused" in replyMessage) return { refused: replyMessage.refused };
  const failed = deliver(ctx, dest.dir, original.from.project, replyMessage);
  if (failed) return failed;
  const extra: Partial<Message> = {
    answeredAt: at,
    ...(options.branch ? { branch: options.branch } : {}),
    ...(options.item ? { item: options.item } : {}),
    ...(verdict ? { verdict } : {}),
    ...(reason !== undefined ? { reason } : {}),
  };
  const answered = recordEverywhere(
    ctx,
    id,
    (m) => {
      const moved = applyMove(m, to, at, extra);
      return "refused" in moved ? m : moved;
    },
    (w) => notes.push(skippedLine(id)(w)),
  );
  // The reply is delivered by now; a copy of this project's own box left unwritten (changed or busy
  // meanwhile) leaves the original unmarked, and the refusal says so rather than passing another
  // copy off as answered. `delivered` names the reply, so a caller never reads it as not sent, and
  // each caller says it in its words (finding 30).
  if (!answered.changed || answered.ownBusy)
    return {
      refused: `${id} could not be marked answered: ${whyOwnCopyUnwritten(answered)}`,
      delivered: replyMessage.id,
    };
  // The item's record is written under the own mailbox's lock, the lock the sync writes it under
  // too, so a reply from a role's stop and the lead's sync never interleave on it (risk review of
  // SP2c task 3, round 13).
  withMailLock(ownDir, () => {
    recordForParties(ctx, loadRegistry(ctx.paths.userDir), replyMessage);
  });
  return { reply: replyMessage, original: answered.changed };
}

/**
 * Brings this project's record up to date with the others' inboxes: the status of what it sent, as
 * the receiver last recorded it, and the mail that reached it, into the item each message names.
 * Returns the mail this agent had not been told about yet, and how many sent copies changed.
 */
export function syncMail(
  ctx: MailContext,
  paths: CrewPaths,
): { newMail: Message[]; updated: number; tampered: boolean } {
  const own = mailbox(ctx.paths.userDir, ctx.self.workspace, ctx.self.project);
  const registry = loadRegistry(ctx.paths.userDir);
  // Under the own mailbox's lock throughout: the statuses the receivers recorded and the mail that
  // arrived go into the items' mail.json, the file a reply writes under the same lock, and the
  // marker of what this agent was told about is written under it too (risk review, rounds 13 and 14).
  return withMailLock(own.dir, () => {
    let updated = 0;
    const { box: outbox, tampered } = readBox(own.dir, "outbox");
    // Each receiver's inbox read once for the pass, however many messages went to it.
    const inboxes = new Map<string, ReturnType<typeof readBox>>();
    if (!tampered) {
      for (const sent of outbox.messages) {
        if (sent.status === "refused") continue;
        // The receiver's record of the message; a box a hand changed is not read as the engine's.
        const entry = projectEntry(registry, sent.to.workspace, sent.to.project);
        const theirsDir = entry
          ? mailbox(ctx.paths.userDir, entry.workspace, entry.name).dir
          : own.dir;
        const inbox = inboxes.get(theirsDir) ?? readBox(theirsDir, "inbox");
        inboxes.set(theirsDir, inbox);
        if (inbox.tampered) continue;
        const theirs = inbox.box.messages.find((m) => m.id === sent.id);
        if (theirs && JSON.stringify(theirs) !== JSON.stringify(sent)) {
          Object.assign(sent, theirs);
          updated += 1;
          recordForParties(ctx, registry, sent, paths);
        }
      }
      if (updated) writeBox(own.dir, "outbox", outbox);
    }
    const inbox = ownInbox(ctx);
    if (inbox.tampered) return { newMail: [], updated, tampered: true };
    // What this agent has already been told about, so a hook names each arrival once.
    const marker = join(own.dir, `synced-${ctx.self.agent}.json`);
    const seen = new Set(readJson<string[]>(marker) ?? []);
    const newMail: Message[] = [];
    for (const m of inbox.messages) {
      recordForParties(ctx, registry, m, paths);
      if (!seen.has(m.id)) newMail.push(m);
      seen.add(m.id);
    }
    writeJson(marker, [...seen]);
    return { newMail, updated, tampered: false };
  });
}

/** A blocker the Stop hook has named to the session, so it interrupts once (SP2c §6); a copy the pass could not change is a line for the hook. */
export function markNoticed(ctx: MailContext, id: string, notes: string[]): void {
  updateEverywhere(
    ctx,
    id,
    (m) => ({ ...m, noticedAt: nowIso() }),
    (w) => notes.push(skippedLine(id)(w)),
  );
}

/** A message's status set wherever the message is recorded; the opener and `approve` use it. A copy the pass could not change is a line for the caller's output. */
export function updateStatusEverywhere(
  ctx: MailContext,
  id: string,
  status: Message["status"],
  reason: string | undefined,
  notes: string[],
): void {
  updateEverywhere(
    ctx,
    id,
    (m) => ({
      ...m,
      status,
      ...(reason !== undefined ? { reason } : {}),
    }),
    (w) => notes.push(skippedLine(id)(w)),
  );
}

/** What the inbox holds for this project, and the one line the hooks print about it. */
export interface InboxSummary {
  /** The session's messages, as read once for this summary (none when tampered). */
  messages: Message[];
  unread: number;
  answered: number;
  waiting: number;
  blockers: Message[];
  /** The inbox changed outside the engine: nothing in it counts, and `line` says so. */
  tampered: boolean;
  line: string | null;
}

/** The summary of an empty inbox, and what a hook reports when it could not read the inbox. */
export function emptyInboxSummary(): InboxSummary {
  return {
    messages: [],
    unread: 0,
    answered: 0,
    waiting: 0,
    blockers: [],
    tampered: false,
    line: null,
  };
}

/** A message sent and not yet answered: what an inbox counts as unread (SP2c), and what a thread counts for the project it is addressed to (SP7b Task 6). */
export function unanswered(m: Message): boolean {
  return mailStatus(m) === "sent" && !m.replyTo;
}

export function inboxSummary(ctx: MailContext): InboxSummary {
  const { messages, tampered } = ownInbox(ctx);
  if (tampered)
    return { ...emptyInboxSummary(), tampered, line: tamperedBox(ctx.self.project, "inbox") };
  // Counted through the mapped status, so a record of an earlier engine version counts as what it stands for.
  const unread = messages.filter(unanswered);
  // Answered: a reply to something this project asked, landed and not read yet.
  const answered = messages.filter((m) => m.replyTo && mailStatus(m) === "sent");
  const waiting = messages.filter((m) => mailStatus(m) === "blocked");
  const blockers = unread.filter((m) => m.type === "blocker");
  if (!messages.length) return emptyInboxSummary();
  const byType = new Map<string, number>();
  for (const m of unread) byType.set(m.type, (byType.get(m.type) ?? 0) + 1);
  const senders = [...new Set(unread.map((m) => m.from.project))].join(", ");
  const parts: string[] = [];
  if (unread.length)
    parts.push(
      `${unread.length} unread ${[...byType].map(([t, n]) => `${t}${n === 1 ? "" : "s"}`).join(" and ")} from ${senders}`,
    );
  if (answered.length) parts.push(`${answered.length} answered`);
  if (waiting.length) parts.push(`${waiting.length} waiting for a person`);
  const where = ctx.self.workspace ?? "alone";
  return {
    messages,
    unread: unread.length,
    answered: answered.length,
    waiting: waiting.length,
    blockers,
    tampered,
    line: parts.length ? `Mail (${where}): ${parts.join(", ")}` : null,
  };
}

/**
 * The sessions this project opened that have not ended, as its outbox records them. When the outbox
 * changed outside the engine nothing in it counts: `messages` is empty, `tampered` is the refusal
 * the caller says, and `untrusted` holds what the outbox records as still open, for a person to
 * stop by its pid or read by its log.
 */
export function readOpenSessions(ctx: MailContext): {
  messages: Message[];
  tampered: string | null;
  untrusted: Message[];
} {
  const { box, tampered } = readBox(
    mailbox(ctx.paths.userDir, ctx.self.workspace, ctx.self.project).dir,
    "outbox",
  );
  const open = box.messages.filter((m) => m.opened && !m.opened.endedAt);
  return tampered
    ? { messages: [], tampered: tamperedBox(ctx.self.project, "outbox"), untrusted: open }
    : { messages: open, tampered: null, untrusted: [] };
}

/** `expert-3` → 3; null for any other agent. */
export function expertNumber(agent: string): number | null {
  const match = /^expert-(\d+)$/.exec(agent);
  return match ? Number(match[1]) : null;
}
