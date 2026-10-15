import { existsSync, mkdirSync, rmdirSync, statSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import { loadEvidence } from "./evidence.ts";
import { nowIso, readJson, readText, writeJson, writeText } from "./fs.ts";
import {
  type CrewPaths,
  canonical,
  mailboxDir,
  registryPath,
  resolvePaths,
  workDir,
} from "./paths.ts";
import { loadPolicy } from "./policy.ts";
import {
  readProtectedJson,
  readProtectedJsonAt,
  writeProtectedJson,
  writeProtectedJsonAt,
} from "./store.ts";
import type {
  MailAddressee,
  Mailbox,
  MailParty,
  MailPolicy,
  MailType,
  Message,
  OpenedSession,
  OpenMode,
  Policy,
  ProjectEntry,
  Registry,
  WorkItem,
} from "./types.ts";
import { loadWork } from "./work.ts";

/** A project is live when a hook or a command ran in it within this long (SP2c §6). */
export const LIVE_MS = 10 * 60 * 1000;
/** A body under this many bytes travels in the message; a longer one lives beside the inbox. */
export const INLINE_BODY_LIMIT = 2048;
const PREVIEW_CHARS = 200;
const SUBJECT_CHARS = 80;
const LOCK_STALE_MS = 10_000;
const LOCK_WAIT_MS = 2_000;
export const ROLE_AGENT =
  /^(judge|researcher|expert-\d+|devils-advocate|fault-finder|review-(code-quality|test-quality|security|ui-ux|risk))$/;
export const TASK_AGENT = /^T-\d+$/;
const CRITICS = new Set(["devils-advocate", "fault-finder"]);

/** Who this engine is in the mail: its workspace, its name, the agent it speaks as, and how far from a first message it is. */
export interface MailSelf {
  workspace: string | null;
  project: string;
  agent: string;
  hops: number;
  /** The message that opened this session, when one did (`WIZARDINGCODE_CREW_MAIL_ID`). */
  openedBy: string | null;
}

export interface MailContext {
  paths: CrewPaths;
  policy: Policy;
  env: NodeJS.ProcessEnv;
  self: MailSelf;
}

/** The main checkout of a git worktree (its `.git` is a file naming the parent's), or null for a checkout of its own. */
export function worktreeMainRoot(root: string): string | null {
  const gitFile = join(root, ".git");
  try {
    if (!statSync(gitFile).isFile()) return null;
  } catch {
    return null;
  }
  const line = readText(gitFile)?.trim() ?? "";
  const match = /^gitdir:\s*(.+?)\/\.git\/worktrees\/[^/]+\/?$/.exec(line);
  return match?.[1] ? canonical(isAbsolute(match[1]) ? match[1] : join(root, match[1])) : null;
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

/** Who this checkout is in the mail. The project's name is the governing policy's `mail.name`, else the folder's (the main checkout's, for a worktree): the one naming rule, read everywhere through `ctx.self.project`. */
export function mailSelf(paths: CrewPaths, policy: Policy, env: NodeJS.ProcessEnv): MailSelf {
  const hops = Number(env.WIZARDINGCODE_CREW_MAIL_HOPS ?? "0");
  const { mail, main } = effectiveMailPolicy(paths.root, policy, env);
  return {
    workspace: mail.workspace,
    project: mail.name ?? basename(main ?? paths.root),
    agent: env.WIZARDINGCODE_CREW_MAIL_AGENT?.trim() || "session",
    hops: Number.isInteger(hops) && hops >= 0 ? hops : 0,
    openedBy: env.WIZARDINGCODE_CREW_MAIL_ID?.trim() || null,
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

export function isLive(entry: ProjectEntry, now = Date.now()): boolean {
  const seen = Date.parse(entry.lastSeen);
  return Number.isFinite(seen) && now - seen <= LIVE_MS;
}

/**
 * Records this project in the registry: its root, its name, its workspace, when it was last seen
 * and by which session; a worktree names its main checkout and the message that opened it. With
 * `minIntervalMs`, an entry seen more recently than that is left as it is (a tool call does not
 * pay a write each time; decision 3 of the plan).
 */
export function registerProject(
  ctx: MailContext,
  sessionId: string,
  options: { minIntervalMs?: number } = {},
): ProjectEntry {
  const registry = loadRegistry(ctx.paths.userDir);
  const existing = registry.projects.find((p) => p.root === ctx.paths.root);
  if (
    existing &&
    options.minIntervalMs !== undefined &&
    Date.now() - Date.parse(existing.lastSeen) < options.minIntervalMs &&
    existing.sessionId === sessionId
  )
    return existing;
  const main = worktreeMainRoot(ctx.paths.root);
  const entry: ProjectEntry = {
    root: ctx.paths.root,
    name: ctx.self.project,
    workspace: ctx.self.workspace,
    lastSeen: nowIso(),
    sessionId,
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
 * across. Worktrees are never the destination of a name: the main checkout is.
 */
export function resolveProject(
  ctx: MailContext,
  to: string,
): { entry: ProjectEntry } | { refused: string } {
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
    return { entry: own };
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
    return { entry: alive[0] as ProjectEntry };
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
  const read = readProtectedJsonAt<Mailbox>(boxFile(dir, "integrity"), boxFile(dir, which));
  const box: Mailbox =
    read.data && Array.isArray(read.data.messages) ? read.data : { version: 1, messages: [] };
  return { box, tampered: read.tampered };
}

export function writeBox(dir: string, which: "inbox" | "outbox", box: Mailbox): void {
  writeProtectedJsonAt(boxFile(dir, "integrity"), boxFile(dir, which), box);
}

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * One writer at a time per mailbox: the lock is a folder, created atomically, held for the
 * duration of `fn`. A lock older than ten seconds was left by a process that died and is taken;
 * a lock still fresh after the wait is reported, never broken (review focus 1).
 */
export function withMailLock<T>(dir: string, fn: () => T, options: { waitMs?: number } = {}): T {
  mkdirSync(dir, { recursive: true });
  const lock = join(dir, ".lock");
  const waitMs = options.waitMs ?? LOCK_WAIT_MS;
  const started = Date.now();
  for (;;) {
    try {
      mkdirSync(lock);
      break;
    } catch (error) {
      // Only another holder is contention; anything else (no permission, no space) is thrown, as
      // the neighbours throw it.
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    let age: number | null = null;
    try {
      age = Date.now() - statSync(lock).mtimeMs;
    } catch {
      // gone between the two calls: taken again below, within the same wait
    }
    if (age !== null && age > LOCK_STALE_MS) {
      try {
        rmdirSync(lock);
      } catch {
        // another process took it first
      }
      continue;
    }
    if (Date.now() - started >= waitMs)
      throw new Error(`mailbox busy: ${lock} held for more than ${waitMs} ms`);
    if (age !== null) sleep(20);
  }
  try {
    return fn();
  } finally {
    try {
      rmdirSync(lock);
    } catch {
      // already released
    }
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

// ---------------------------------------------------------------------------------------------
// Sending

export interface SendRequest {
  to: string;
  agent?: string;
  type: MailType;
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

function subjectOf(request: { subject?: string; text: string }): string {
  if (request.subject?.trim()) return request.subject.trim().slice(0, SUBJECT_CHARS);
  const first = request.text.split("\n").find((l) => l.trim()) ?? "";
  return first.length > SUBJECT_CHARS - 3 ? `${first.slice(0, SUBJECT_CHARS - 3)}...` : first;
}

/** The destination's policy, read as its engine would; null when the root is not a crew project. */
function destinationPolicy(
  entry: ProjectEntry,
  env: NodeJS.ProcessEnv,
): { policy: Policy; tampered: boolean } | null {
  const paths = resolvePaths(entry.root, env);
  return paths ? loadPolicy(paths) : null;
}

/** The sessions open in a destination: messages in its inbox with a session started and not ended. */
function openIn(userDir: string, workspace: string | null, project: string): number {
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
 */
function appendToBox(
  dir: string,
  which: "inbox" | "outbox",
  owner: string,
  build: (box: Mailbox) => Message,
): Message | { refused: string } {
  return withMailLock(dir, (): Message | { refused: string } => {
    const { box, tampered } = readBox(dir, which);
    if (tampered) return { refused: tamperedBox(owner, which) };
    const message = build(box);
    box.messages.push(message);
    writeBox(dir, which, box);
    return message;
  });
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
  const resolved = resolveProject(ctx, request.to);
  // A refusal is recorded in the sender's outbox; when that outbox is itself tampered, nothing is.
  const refuse = (
    reason: string,
    to: MailAddressee,
  ): { refused: string; message: Message | null } => {
    const written = appendToBox(own.dir, "outbox", self.project, (box) => ({
      id: newMessageId(box, self.project, at),
      at,
      from: party(self, itemId),
      to,
      type: request.type,
      subject: subjectOf({ subject: request.subject, text }),
      body: text.slice(0, PREVIEW_CHARS),
      replyTo: request.replyTo ?? null,
      hops: self.hops,
      status: "refused",
      reason,
      opened: null,
    }));
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
  const toSelf = entry.root === (worktreeMainRoot(ctx.paths.root) ?? ctx.paths.root);
  const to: MailAddressee = {
    workspace: self.workspace ?? "_alone",
    project: entry.name,
    item: null,
    agent: request.agent ?? null,
  };
  let relayed = false;
  if (request.agent) {
    if (!toSelf)
      return refuse(
        `--agent addresses a role or a task of this project; ${entry.name} is another project`,
        to,
      );
    if (ROLE_AGENT.test(request.agent)) {
      relayed = true;
      if (request.agent === "judge" && self.agent !== "session")
        return refuse(
          `a message to the judge comes from the lead (session), not from ${self.agent}`,
          to,
        );
      if (CRITICS.has(request.agent)) {
        const proposals = itemId ? `.crew/work/${itemId}/conclave/proposals.md` : null;
        const given = request.filePath
          ? canonical(resolve(ctx.paths.root, request.filePath))
          : null;
        if (
          !proposals ||
          !given ||
          given !== canonical(join(ctx.paths.root, proposals)) ||
          request.text.trim()
        )
          return refuse(
            `a message to ${request.agent} carries ${proposals ?? ".crew/work/<id>/conclave/proposals.md"} (--file) and nothing else`,
            to,
          );
      }
    } else if (TASK_AGENT.test(request.agent)) {
      if (!(work?.tasks ?? []).some((t) => t.task === request.agent))
        return refuse(
          `${request.agent} is not a task of ${work?.id ?? "the active item"} (crew task <id> open ${request.agent} …)`,
          to,
        );
    } else if (request.agent !== "session") {
      return refuse(`--agent is session, a task (T-n) or a role, not ${request.agent}`, to);
    }
  }
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
  const message = appendToBox(own.dir, "outbox", self.project, (outbox) => {
    const id = newMessageId(outbox, self.project, at);
    return {
      id,
      at,
      from: party(self, itemId),
      to,
      type: request.type,
      subject: subjectOf({ subject: request.subject, text }),
      ...placeBody(dest.dir, id, text),
      replyTo: request.replyTo ?? null,
      hops: self.hops,
      status: "sent",
      ...(relayed ? { relayed: true } : {}),
      opened: null,
    };
  });
  if ("refused" in message) return { refused: message.refused, message: null };
  const failed = deliver(ctx, dest.dir, entry.name, message);
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
 * the refusal returned; null when delivered.
 */
function deliver(
  ctx: MailContext,
  dir: string,
  owner: string,
  message: Message,
): { refused: string } | null {
  const delivered = appendToBox(dir, "inbox", owner, () => message);
  if (!("refused" in delivered)) return null;
  const reason = delivered.refused;
  updateEverywhere(ctx, message.id, (m) => ({ ...m, status: "refused", reason }));
  return { refused: reason };
}

/** Records the session the engine opened for a message: in the receiver's inbox, the sender's outbox and the item's copy. */
export function recordOpened(ctx: MailContext, id: string, opened: OpenedSession): void {
  updateEverywhere(ctx, id, (m) => ({ ...m, opened }));
}

/** The one place a message's state changes: the inbox it sits in, the outbox it left, the item that sent or received it. */
function updateEverywhere(
  ctx: MailContext,
  id: string,
  change: (m: Message) => Message,
): Message | null {
  let result = null as Message | null;
  const registry = loadRegistry(ctx.paths.userDir);
  const boxes = new Set<string>();
  for (const p of registry.projects) {
    if (!p.worktreeOf) boxes.add(mailbox(ctx.paths.userDir, p.workspace, p.name).dir);
  }
  boxes.add(mailbox(ctx.paths.userDir, ctx.self.workspace, ctx.self.project).dir);
  for (const dir of boxes) {
    for (const which of ["inbox", "outbox"] as const) {
      if (!existsSync(boxFile(dir, which))) continue;
      withMailLock(dir, () => {
        const { box, tampered } = readBox(dir, which);
        const index = box.messages.findIndex((m) => m.id === id);
        if (index === -1 || tampered) return;
        const changed = change(box.messages[index] as Message);
        box.messages[index] = changed;
        writeBox(dir, which, box);
        result = result ?? changed;
      });
    }
  }
  if (result) {
    const m: Message = result;
    for (const item of [m.from.item, m.to.item]) {
      if (!item) continue;
      // The copy is the item's where the item lives: the sender's root for `from`, this root for `to`.
      recordInItem(ctx.paths, item, m);
      const senderRoot = projectEntry(registry, m.from.workspace, m.from.project)?.root;
      const senderPaths = senderRoot ? resolvePaths(senderRoot, ctx.env) : null;
      if (senderPaths && senderPaths.root !== ctx.paths.root) recordInItem(senderPaths, item, m);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------------------------
// Receiving

/** The messages addressed to this project and this agent (`session` reads what names no agent). */
export function ownInbox(ctx: MailContext): { messages: Message[]; tampered: boolean } {
  const { box, tampered } = readBox(
    mailbox(ctx.paths.userDir, ctx.self.workspace, ctx.self.project).dir,
    "inbox",
  );
  // A message that names no agent is the session's.
  const mine = box.messages.filter((m) => (m.to.agent ?? "session") === ctx.self.agent);
  return { messages: mine.sort((a, b) => a.at.localeCompare(b.at)), tampered };
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

/** `updateEverywhere` found no box it could write (one changed while it was being written): a refusal, never a stale copy. */
function notUpdated(id: string): { refused: string } {
  return { refused: `${id} could not be updated: its mailbox changed while it was being written` };
}

export function markRead(ctx: MailContext, id: string): Message | { refused: string } {
  const own = ownMessage(ctx, id);
  if ("refused" in own) return own;
  if (own.found.status !== "sent") return own.found;
  return (
    updateEverywhere(ctx, id, (m) => ({ ...m, status: "read", readAt: nowIso() })) ?? notUpdated(id)
  );
}

export function refuseMail(
  ctx: MailContext,
  id: string,
  reason: string,
): Message | { refused: string } {
  const own = ownMessage(ctx, id);
  if ("refused" in own) return own;
  if (own.found.status !== "sent" && own.found.status !== "read")
    return { refused: `${id} is ${own.found.status}; nothing to refuse` };
  if (!reason.trim()) return { refused: 'a refusal needs --reason "<why>"' };
  return (
    updateEverywhere(ctx, id, (m) => ({ ...m, status: "refused", reason: reason.trim() })) ??
    notUpdated(id)
  );
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
  options: { filePath?: string; branch?: string; item?: string; as?: string },
): { reply: Message; original: Message } | { refused: string } {
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
  if (original.status === "answered")
    return { refused: `${id} is answered; a second answer is a new message` };
  if (original.status === "refused") return { refused: `${id} is refused; it has no answer` };
  if (original.status === "expired" || original.status === "stopped")
    return { refused: `${id} is ${original.status}; its session is over` };
  if (options.as !== undefined && !ROLE_AGENT.test(options.as))
    return {
      refused:
        "--as names a role: judge, researcher, expert-<n>, devils-advocate, fault-finder or review-<gate>",
    };
  if (options.as && (original.to.agent ?? "session") !== options.as)
    return {
      refused: `${id} is addressed to ${original.to.agent ?? "session"}, not to ${options.as}`,
    };
  // The child's verdict is read from its evidence, never typed (SP2c §7).
  if (options.item && !loadWork(ctx.paths, options.item).work)
    return { refused: `unknown work item: ${options.item}` };
  const verdict = options.item ? loadEvidence(ctx.paths, options.item).evidence.verdict : undefined;
  const attached = attachFile(ctx.paths.root, text, options.filePath);
  if ("refused" in attached) return { refused: attached.refused };
  const body = attached.text;
  if (!body.trim()) return { refused: "a reply needs a text (or --file)" };
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
    return {
      id: replyId,
      at,
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
      hops: ctx.self.hops,
      status: "sent",
      ...(options.as || original.relayed ? { relayed: true } : {}),
      opened: null,
      ...(options.branch ? { branch: options.branch } : {}),
      ...(options.item ? { item: options.item } : {}),
      ...(verdict ? { verdict } : {}),
    };
  });
  if ("refused" in replyMessage) return { refused: replyMessage.refused };
  const failed = deliver(ctx, dest.dir, original.from.project, replyMessage);
  if (failed) return failed;
  const answered = updateEverywhere(ctx, id, (m) => ({
    ...m,
    status: "answered",
    answeredAt: at,
    ...(options.branch ? { branch: options.branch } : {}),
    ...(options.item ? { item: options.item } : {}),
    ...(verdict ? { verdict } : {}),
  }));
  // The reply is delivered by now; a box that changed meanwhile leaves the original unmarked, and the
  // refusal says so rather than passing the stale copy off as answered.
  if (!answered)
    return {
      refused: `${replyMessage.id} was delivered, but ${id} could not be marked answered: its mailbox changed while it was being written`,
    };
  for (const item of [replyMessage.to.item, replyMessage.from.item])
    if (item) recordInItem(ctx.paths, item, replyMessage);
  return { reply: replyMessage, original: answered };
}

/**
 * Brings this project's record up to date with the others' inboxes: the status of what it sent, as
 * the receiver last recorded it, and the mail that reached it, into the item each message names.
 * Returns the replies that landed since the last sync (the hooks clear a `mail` wait with them).
 */
export function syncMail(
  ctx: MailContext,
  paths: CrewPaths,
): { newMail: Message[]; newReplies: Message[]; updated: number; tampered: boolean } {
  const own = mailbox(ctx.paths.userDir, ctx.self.workspace, ctx.self.project);
  const registry = loadRegistry(ctx.paths.userDir);
  let updated = 0;
  withMailLock(own.dir, () => {
    const { box: outbox, tampered } = readBox(own.dir, "outbox");
    if (tampered) return;
    for (const sent of outbox.messages) {
      if (sent.status === "refused") continue;
      // The receiver's record of the message; a box a hand changed is not read as the engine's.
      const entry = projectEntry(registry, sent.to.workspace, sent.to.project);
      const theirsDir = entry
        ? mailbox(ctx.paths.userDir, entry.workspace, entry.name).dir
        : own.dir;
      const inbox = readBox(theirsDir, "inbox");
      if (inbox.tampered) continue;
      const theirs = inbox.box.messages.find((m) => m.id === sent.id);
      if (theirs && JSON.stringify(theirs) !== JSON.stringify(sent)) {
        Object.assign(sent, theirs);
        updated += 1;
        if (sent.from.item) recordInItem(paths, sent.from.item, sent);
      }
    }
    if (updated) writeBox(own.dir, "outbox", outbox);
  });
  const inbox = ownInbox(ctx);
  if (inbox.tampered) return { newMail: [], newReplies: [], updated, tampered: true };
  // What this agent has already been told about, so a hook names each arrival once.
  const marker = join(own.dir, `synced-${ctx.self.agent}.json`);
  const seen = new Set(readJson<string[]>(marker) ?? []);
  const newMail: Message[] = [];
  for (const m of inbox.messages) {
    if (m.to.item) recordInItem(paths, m.to.item, m);
    if (!seen.has(m.id)) newMail.push(m);
    seen.add(m.id);
  }
  writeJson(marker, [...seen]);
  return {
    newMail,
    newReplies: newMail.filter((m) => m.replyTo !== null),
    updated,
    tampered: false,
  };
}

/** A blocker the Stop hook has named to the session, so it interrupts once (SP2c §6). */
export function markNoticed(ctx: MailContext, id: string): void {
  updateEverywhere(ctx, id, (m) => ({ ...m, noticedAt: nowIso() }));
}

/** A message's status set wherever the message is recorded; the opener and `approve` use it. */
export function updateStatusEverywhere(
  ctx: MailContext,
  id: string,
  status: Message["status"],
  reason?: string,
): void {
  updateEverywhere(ctx, id, (m) => ({
    ...m,
    status,
    ...(reason !== undefined ? { reason } : {}),
  }));
}

/** What the inbox holds for this project, and the one line the hooks print about it. */
export function inboxSummary(ctx: MailContext): {
  unread: number;
  answered: number;
  waiting: number;
  blockers: Message[];
  /** The inbox changed outside the engine: nothing in it counts, and `line` says so. */
  tampered: boolean;
  line: string | null;
} {
  const { messages, tampered } = ownInbox(ctx);
  const empty = { unread: 0, answered: 0, waiting: 0, blockers: [] };
  if (tampered) return { ...empty, tampered, line: tamperedBox(ctx.self.project, "inbox") };
  const unread = messages.filter((m) => m.status === "sent" && !m.replyTo);
  const answered = messages.filter((m) => m.replyTo && m.status === "sent");
  const waiting = messages.filter((m) => m.status === "waiting-for-person");
  const blockers = unread.filter((m) => m.type === "blocker");
  if (!messages.length) return { ...empty, tampered, line: null };
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
    unread: unread.length,
    answered: answered.length,
    waiting: waiting.length,
    blockers,
    tampered,
    line: parts.length ? `Mail (${where}): ${parts.join(", ")}` : null,
  };
}

/** The sessions this project opened that have not ended, as its outbox records them. */
export function openSessions(ctx: MailContext): Message[] {
  const { box, tampered } = readBox(
    mailbox(ctx.paths.userDir, ctx.self.workspace, ctx.self.project).dir,
    "outbox",
  );
  return tampered ? [] : box.messages.filter((m) => m.opened && !m.opened.endedAt);
}

/** `expert-3` → 3; null for any other agent. */
export function expertNumber(agent: string): number | null {
  const match = /^expert-(\d+)$/.exec(agent);
  return match ? Number(match[1]) : null;
}
