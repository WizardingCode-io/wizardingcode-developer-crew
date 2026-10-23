import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { readJson, readText, writeJson } from "./fs.ts";
import { LockBusy, withLock } from "./lock.ts";
import { worktreeMainRoot } from "./mail.ts";
import { type CrewPaths, canonical, pathsFor } from "./paths.ts";
import { readProtectedText, writeProtectedText } from "./store.ts";
import { TEAMS } from "./team.ts";
import type { Policy, TeamName } from "./types.ts";
import { gitRun } from "./worktree.ts";

export interface SessionState {
  baseline: string | null;
  stopBlocks: number;
  /** What a hook could not say to the session's model in its own response, printed at the next chance (`hooks/notices.ts`). */
  notices?: string[];
  /** Where the session's last hook ran and when (session lanes, AC-1): written at most once a minute. */
  cwd?: string;
  seenAt?: string;
  /** Set by SessionEnd, whatever its reason: the session is no neighbour from then on. */
  endedAt?: string;
  /** The item this session's crew start made (AC-2), read from the engine's state, never from the command's output. */
  item?: string;
  /** When the session's last crew start was let through (PreToolUse): an item created before it is not that start's. */
  startAt?: string;
  /** The checkout's active item at that PreToolUse: the start's item is another one. */
  startActive?: string;
}

/** A role the session launched through the Agent tool and whose stop has not come (SP7 §14): what the mod shows as working. */
export interface WorkingRole {
  agent: string;
  team: TeamName | null;
  since: string;
  sessionId: string;
  description?: string;
}

export interface LocalState {
  active: string | null;
  sessions: Record<string, SessionState>;
  working?: WorkingRole[];
}

/** A session is live within ten minutes of its last hook and until its SessionEnd (session lanes, AC-1). */
export const SESSION_LIVE_MS = 600_000;
/** How often a session's hooks record it: one locked write a minute at most. */
export const SEEN_EVERY_MS = 60_000;
/** A session record not seen for a day is dropped when the state is written. */
const SESSION_TTL_MS = 86_400_000;
const WORK_ID = /^\d{4}-\d{2}-\d{2}-\d{3}-[a-z0-9-]*$/;

/** A role still "working" after an hour never stopped (a killed subagent, a crashed session): dropped on read. */
export const WORKING_TTL_MS = 3_600_000;
/** The newest entries kept: a burst of launches in one hour never grows the state file past this. */
export const WORKING_MAX = 50;
const DESCRIPTION_MAX = 120;

/** A text cut at `max` characters, the last one an ellipsis when anything was cut. */
export function cut(text: string, max = DESCRIPTION_MAX): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * The description an Agent launch gave, as one printable line (security review of SP7a Task 7): the
 * text comes from whatever launched the subagent, so a terminal escape, a newline forging a status
 * line or ten thousand characters are not written and never drawn. The bidirectional and invisible
 * format characters are deleted, not spaced, so a name cannot read in another order than its bytes
 * (finding 58, the security lead's return).
 */
export function oneLine(text: string): string {
  const line = text
    // biome-ignore lint/suspicious/noControlCharactersInRegex: the escape sequences are the subject
    .replace(/(?:\x1b\[|\x9b)[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g, "")
    // biome-ignore lint/suspicious/noControlCharactersInRegex: C0, DEL and C1 are the subject
    .replace(/[\x00-\x1f\x7f-\x9f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cut(line);
}

/** The entries a state file holds that have the shape the engine writes; anything else is dropped, never thrown on. */
function wellShaped(raw: unknown): WorkingRole[] {
  if (!Array.isArray(raw)) return [];
  const kept: WorkingRole[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const w = entry as Record<string, unknown>;
    if (typeof w.agent !== "string" || typeof w.since !== "string") continue;
    if (w.team !== null && !(typeof w.team === "string" && Object.hasOwn(TEAMS, w.team))) continue;
    // A description is cleaned to one line again on load (finding 58): the file may have been
    // written by hand or by an older engine. One that cleans to nothing drops the entry.
    const description = typeof w.description === "string" ? oneLine(w.description) : undefined;
    if (description === "") continue;
    kept.push({
      agent: w.agent,
      team: w.team as TeamName | null,
      since: w.since,
      sessionId: typeof w.sessionId === "string" ? w.sessionId : "",
      ...(description !== undefined ? { description } : {}),
    });
  }
  return kept.slice(-WORKING_MAX);
}

function live(working: WorkingRole[] | undefined, now: number): WorkingRole[] {
  return (working ?? []).filter((w) => now - Date.parse(w.since) < WORKING_TTL_MS);
}

export function recordWorking(paths: CrewPaths, role: WorkingRole): void {
  const entry: WorkingRole = {
    ...role,
    ...(role.description === undefined ? {} : { description: oneLine(role.description) }),
  };
  if (entry.description === "") delete entry.description;
  updateState(paths, (state) => {
    state.working = [...live(state.working, Date.parse(role.since)), entry].slice(-WORKING_MAX);
  });
}

/** The PreToolUse hook knows no agent id, so the name is the key: the oldest entry of that name goes. */
export function clearWorking(paths: CrewPaths, agent: string): void {
  updateState(paths, (state) => {
    const working = live(state.working, Date.now());
    const index = working.findIndex((w) => w.agent === agent);
    if (index !== -1) working.splice(index, 1);
    state.working = working;
  });
}

export function workingRoles(paths: CrewPaths, now = Date.now()): WorkingRole[] {
  return live(loadState(paths).working, now);
}

function statePath(paths: CrewPaths): string {
  return join(paths.localDir, "state.json");
}

const isDate = (value: unknown) => typeof value === "string" && !Number.isNaN(Date.parse(value));

/**
 * The session records of a state file that have the shape the engine writes (the security lead's
 * R-2): an entry that is not a record, a time that is no date, a cwd that is no text or an item
 * that is no work id is dropped, never thrown on. The record is liveness data: a dropped one is no
 * neighbour.
 */
function wellShapedSessions(raw: unknown): Record<string, SessionState> {
  const kept: Record<string, SessionState> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return kept;
  for (const [id, entry] of Object.entries(raw)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const s = entry as Record<string, unknown>;
    if (s.seenAt !== undefined && !isDate(s.seenAt)) continue;
    if (s.endedAt !== undefined && !isDate(s.endedAt)) continue;
    if (s.startAt !== undefined && !isDate(s.startAt)) continue;
    if (s.cwd !== undefined && typeof s.cwd !== "string") continue;
    if (s.item !== undefined && !(typeof s.item === "string" && WORK_ID.test(s.item))) continue;
    if (
      s.startActive !== undefined &&
      !(typeof s.startActive === "string" && WORK_ID.test(s.startActive))
    )
      continue;
    kept[id] = entry as SessionState;
  }
  return kept;
}

export function loadState(paths: CrewPaths): LocalState {
  const raw = readJson<Partial<LocalState>>(statePath(paths)) ?? {};
  return {
    active: typeof raw.active === "string" ? raw.active : null,
    sessions: wellShapedSessions(raw.sessions),
    ...(Array.isArray(raw.working) ? { working: wellShaped(raw.working) } : {}),
  };
}

export function saveState(paths: CrewPaths, state: LocalState): void {
  const now = Date.now();
  for (const [id, session] of Object.entries(state.sessions))
    if (session.seenAt && now - Date.parse(session.seenAt) > SESSION_TTL_MS)
      delete state.sessions[id];
  writeJson(statePath(paths), state);
}

/** The sessions of this checkout seen within ten minutes of `now` and not ended, by id. */
export function liveSessions(paths: CrewPaths, now = Date.now()): Record<string, SessionState> {
  const live: Record<string, SessionState> = {};
  for (const [id, session] of Object.entries(loadState(paths).sessions))
    if (session.seenAt && !session.endedAt && now - Date.parse(session.seenAt) <= SESSION_LIVE_MS)
      live[id] = session;
  return live;
}

/**
 * The session's heartbeat (AC-1): its cwd and the time, written under the state's lock when the
 * record is a minute old or more, or ended (a resumed session is live again); nothing otherwise.
 */
export function recordSeen(
  paths: CrewPaths,
  sessionId: string,
  cwd: string,
  now = Date.now(),
): void {
  const seen = loadState(paths).sessions[sessionId];
  if (
    seen?.seenAt &&
    !seen.endedAt &&
    seen.cwd === cwd &&
    now - Date.parse(seen.seenAt) < SEEN_EVERY_MS
  )
    return;
  updateSession(paths, sessionId, (session) => {
    session.cwd = cwd;
    session.seenAt = new Date(now).toISOString();
    delete session.endedAt;
  });
}

export function sessionState(state: LocalState, sessionId: string): SessionState {
  const existing = state.sessions[sessionId];
  if (existing) return existing;
  const created: SessionState = { baseline: null, stopBlocks: 0 };
  state.sessions[sessionId] = created;
  return created;
}

const STATE_LOCK_WAIT_MS = 500;

/**
 * A read-modify-write of the local state under its folder's lock, the one every writer takes, so
 * what another hook wrote meanwhile (a notice a role's stop left, `hooks/notices.ts`) is not written
 * over by one that loaded the state before it. The lock is waited for half a second; one still held
 * then is passed by, since a hook that failed here would fail open and skip its rule, and a notice
 * lost to that window is still in the person's systemMessage. The unlocked fallback is the user's
 * decision of 2026-10-22 (consolidation item 6): kept, rather than a refusal that would switch a
 * hook's rule off for the turn.
 */
export function updateState<T>(paths: CrewPaths, change: (state: LocalState) => T): T {
  const run = (): T => {
    const state = loadState(paths);
    const result = change(state);
    saveState(paths, state);
    return result;
  };
  try {
    return withLock(paths.localDir, run, { what: "session state", waitMs: STATE_LOCK_WAIT_MS });
  } catch (error) {
    if (!(error instanceof LockBusy)) throw error;
    return run();
  }
}

/** `updateState` on one session's state. */
export function updateSession<T>(
  paths: CrewPaths,
  sessionId: string,
  change: (session: SessionState) => T,
): T {
  return updateState(paths, (state) => change(sessionState(state, sessionId)));
}

/** Keeps machine-local state and logs out of the repository; work artefacts too when the policy says so. */
export function ensureCrewDir(paths: CrewPaths, policy: Policy): void {
  // UI captures are binaries that grow the repository per item; the findings, the ruling and the
  // diff are evidence and stay (review of SP2b, finding 5; the merge checklist keeps captures out).
  // Task worktrees go under .crew/ when the policy's mail.worktrees says so (plan decision 12).
  const wanted = `local/\nwork/*/logs/\nwork/*/review/ui/\nworktrees/\n${policy.artifacts === "local" ? "work/\n" : ""}`;
  const file = join(paths.crewDir, ".gitignore");
  if (readText(file) !== wanted) writeProtectedText(paths, file, wanted);
}

/**
 * Whether `root` is a worktree of `main` as git itself says (the security lead's R-3): its common
 * git folder is `<main>/.git`, and the main's record of the worktree points back at its `.git`. A
 * `.git` file naming a foreign folder fails one or the other. The gitdir's name is read with either
 * separator and a trailing one dropped, as a Windows git writes it (triage L8).
 */
export function isWorktreeOf(root: string, main: string): boolean {
  try {
    const common = gitRun(root, "rev-parse", "--git-common-dir");
    if (canonical(resolve(root, common)) !== canonical(join(main, ".git"))) return false;
    const line = readText(join(root, ".git"))?.trim() ?? "";
    const name =
      line
        .replace(/^gitdir:\s*/, "")
        .replace(/[/\\]+$/, "")
        .split(/[/\\]/)
        .pop() ?? "";
    const record = join(main, ".git", "worktrees", name);
    const back = readText(join(record, "gitdir"))?.trim() ?? "";
    return back !== "" && canonical(resolve(record, back)) === canonical(join(root, ".git"));
  } catch {
    return false;
  }
}

/**
 * A worktree's policy and profile, taken from its main checkout when it lacks them, at the first
 * engine command (session lanes, AC-5): the main is verified first, each file read as protected in
 * the main's own paths and copied byte for byte under the worktree's integrity record; a file the
 * worktree has is never overwritten, a file the main lacks copies nothing. Returns what was not
 * copied and why, for the command to say.
 */
export function adoptMainFiles(paths: CrewPaths): string[] {
  const main = worktreeMainRoot(paths.root);
  if (!main) return [];
  const names = ["policy.json", "profile.json"].filter(
    (name) => !existsSync(join(paths.crewDir, name)) && existsSync(join(main, ".crew", name)),
  );
  if (!names.length) return [];
  if (!isWorktreeOf(paths.root, main))
    return [`${names.join(" and ")} not copied: ${paths.root} is not a worktree of ${main}`];
  const mainPaths = pathsFor(main, paths.userDir);
  const notes: string[] = [];
  for (const name of names) {
    const read = readProtectedText(mainPaths, join(mainPaths.crewDir, name));
    if (read.tampered) notes.push(`${name} not copied: ${main}'s was changed outside the engine`);
    else if (read.data !== null && read.text !== null)
      writeProtectedText(paths, join(paths.crewDir, name), read.text);
  }
  return notes;
}
