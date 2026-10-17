import { accessSync, constants, existsSync, statSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import { loadEvidence } from "./evidence.ts";
import { nowIso, readJson, readText, writeJson, writeText } from "./fs.ts";
import { withLock } from "./lock.ts";
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
 * opener's own outbox did not take the record (it changed outside the engine): the sweep, the stop
 * and the listing read that copy, so a session it does not carry would run unseen by them.
 */
export function recordOpened(
  ctx: MailContext,
  id: string,
  opened: OpenedSession,
  skipped: (what: string) => void,
): Message | null {
  const result = updateEverywhere(ctx, id, (m) => ({ ...m, opened }), skipped);
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
 * engine keeps equal across the copies (every change goes through here).
 */
export function updateEverywhere(
  ctx: MailContext,
  id: string,
  change: (m: Message) => Message,
  skipped: (what: string) => void,
): Message | null {
  let result = null as Message | null;
  const registry = loadRegistry(ctx.paths.userDir);
  const boxes = new Set<string>();
  for (const p of registry.projects) {
    if (!p.worktreeOf) boxes.add(mailbox(ctx.paths.userDir, p.workspace, p.name).dir);
  }
  boxes.add(mailbox(ctx.paths.userDir, ctx.self.workspace, ctx.self.project).dir);
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
    withMailLock(dir, () => {
      let read: ReturnType<typeof readBox>;
      try {
        read = readBox(dir, which);
      } catch (error) {
        skipped(`${boxFile(dir, which)} (${(error as Error).message.split("\n")[0]})`);
        return;
      }
      const { box, tampered } = read;
      if (tampered) {
        skipped(`${boxFile(dir, which)} (changed outside the engine)`);
        return;
      }
      const index = box.messages.findIndex((m) => m.id === id);
      if (index === -1) return;
      const changed = change(box.messages[index] as Message);
      box.messages[index] = changed;
      writeBox(dir, which, box);
      result = result ?? changed;
    });
  }
  if (result) recordForParties(ctx, registry, result);
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

/** A copy of a message the record pass could not change, as a line for the command's output. */
function skippedLine(id: string): (what: string) => string {
  return (what) => `a copy of ${id} was not changed: ${what}`;
}

export function markRead(
  ctx: MailContext,
  id: string,
  notes: string[],
): Message | { refused: string } {
  const own = ownMessage(ctx, id);
  if ("refused" in own) return own;
  if (own.found.status !== "sent") return own.found;
  return (
    updateEverywhere(
      ctx,
      id,
      (m) => ({ ...m, status: "read", readAt: nowIso() }),
      (w) => notes.push(skippedLine(id)(w)),
    ) ?? notUpdated(id)
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
  if (own.found.status !== "sent" && own.found.status !== "read")
    return { refused: `${id} is ${own.found.status}; nothing to refuse` };
  if (!reason.trim()) return { refused: 'a refusal needs --reason "<why>"' };
  return (
    updateEverywhere(
      ctx,
      id,
      (m) => ({ ...m, status: "refused", reason: reason.trim() }),
      (w) => notes.push(skippedLine(id)(w)),
    ) ?? notUpdated(id)
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
  // Where a copy the record pass could not change is named: the command's or the hook's output.
  notes: string[],
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
  const answered = updateEverywhere(
    ctx,
    id,
    (m) => ({
      ...m,
      status: "answered",
      answeredAt: at,
      ...(options.branch ? { branch: options.branch } : {}),
      ...(options.item ? { item: options.item } : {}),
      ...(verdict ? { verdict } : {}),
    }),
    (w) => notes.push(skippedLine(id)(w)),
  );
  // The reply is delivered by now; a box that changed meanwhile leaves the original unmarked, and the
  // refusal says so rather than passing the stale copy off as answered.
  if (!answered)
    return {
      refused: `${replyMessage.id} was delivered, but ${id} could not be marked answered: its mailbox changed while it was being written`,
    };
  // The item's record is written under the own mailbox's lock, the lock the sync writes it under
  // too, so a reply from a role's stop and the lead's sync never interleave on it (risk review of
  // SP2c task 3, round 13).
  withMailLock(ownDir, () => {
    recordForParties(ctx, loadRegistry(ctx.paths.userDir), replyMessage);
  });
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
  // Under the own mailbox's lock throughout: the statuses the receivers recorded and the mail that
  // arrived go into the items' mail.json, the file a reply writes under the same lock, and the
  // marker of what this agent was told about is written under it too (risk review, rounds 13 and 14).
  return withMailLock(own.dir, () => {
    let updated = 0;
    const { box: outbox, tampered } = readBox(own.dir, "outbox");
    if (!tampered) {
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
          recordForParties(ctx, registry, sent, paths);
        }
      }
      if (updated) writeBox(own.dir, "outbox", outbox);
    }
    const inbox = ownInbox(ctx);
    if (inbox.tampered) return { newMail: [], newReplies: [], updated, tampered: true };
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
    return {
      newMail,
      newReplies: newMail.filter((m) => m.replyTo !== null),
      updated,
      tampered: false,
    };
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

export function inboxSummary(ctx: MailContext): InboxSummary {
  const { messages, tampered } = ownInbox(ctx);
  if (tampered)
    return { ...emptyInboxSummary(), tampered, line: tamperedBox(ctx.self.project, "inbox") };
  const unread = messages.filter((m) => m.status === "sent" && !m.replyTo);
  const answered = messages.filter((m) => m.replyTo && m.status === "sent");
  const waiting = messages.filter((m) => m.status === "waiting-for-person");
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
