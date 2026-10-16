import { join } from "node:path";
import { readJson, readText, writeJson } from "./fs.ts";
import { LockBusy, withLock } from "./lock.ts";
import type { CrewPaths } from "./paths.ts";
import { writeProtectedText } from "./store.ts";
import type { Policy } from "./types.ts";

export interface SessionState {
  baseline: string | null;
  stopBlocks: number;
  /** What a hook could not say to the session's model in its own response, printed at the next chance (`hooks/notices.ts`). */
  notices?: string[];
}

export interface LocalState {
  active: string | null;
  sessions: Record<string, SessionState>;
}

function statePath(paths: CrewPaths): string {
  return join(paths.localDir, "state.json");
}

export function loadState(paths: CrewPaths): LocalState {
  const raw = readJson<Partial<LocalState>>(statePath(paths)) ?? {};
  return {
    active: typeof raw.active === "string" ? raw.active : null,
    sessions: raw.sessions ?? {},
  };
}

export function saveState(paths: CrewPaths, state: LocalState): void {
  writeJson(statePath(paths), state);
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
 * lost to that window is still in the person's systemMessage.
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
