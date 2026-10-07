import { join } from "node:path";
import { readJson, readText, writeJson } from "./fs.ts";
import type { CrewPaths } from "./paths.ts";
import { writeProtectedText } from "./store.ts";
import type { Policy } from "./types.ts";

export interface SessionState {
  baseline: string | null;
  stopBlocks: number;
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

/** Keeps machine-local state and logs out of the repository; work artefacts too when the policy says so. */
export function ensureCrewDir(paths: CrewPaths, policy: Policy): void {
  const wanted = `local/\nwork/*/logs/\n${policy.artifacts === "local" ? "work/\n" : ""}`;
  const file = join(paths.crewDir, ".gitignore");
  if (readText(file) !== wanted) writeProtectedText(paths, file, wanted);
}
