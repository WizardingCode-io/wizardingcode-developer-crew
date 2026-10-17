import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { readJson, sha256, writeJson } from "./fs.ts";
import { type CrewPaths, canonical } from "./paths.ts";
import type { OpenMode } from "./types.ts";

/**
 * What opened the session that runs in a checkout, as the engine wrote it when it made the worktree
 * for a branch session (SP2c §10). The record is the engine's own, kept in the user's crew folder
 * under the checkout's id (outside the tree, so git never sees it), written before the session
 * starts and removed when the session has ended or its worktree goes.
 *
 * The record only narrows what the opener's variables say, never widens it (security review of
 * SP2c task 4, round 5): it names the opener, the agent and the depth of a headless session whose
 * variables are gone (the command's second line, when the session's own environment was changed),
 * and nothing more. The branch a session may push is the variables' alone, the depth is the
 * deeper of the two, and a person's own session in the same checkout (attended, with no variable
 * of the opener's) is nobody's child, so the person a full-route item waits for can approve it
 * there. A read-only session runs in the destination's own root, which the lead shares, so it
 * carries no record and is known by its variables alone: a record names a branch session, and
 * holds nothing that says so twice.
 */
export interface OpenedMarker {
  mail: string;
  agent: string;
  hops: number;
}

/** What opened the session, as `mailSelf` and the hooks read it: the variables, narrowed by the record. */
export interface Opener {
  mail: string | null;
  agent: string;
  hops: number;
  mode: OpenMode | null;
  branch: string | null;
}

/**
 * The record's file for a checkout, by its root: the one key, the checkout's id as `resolvePaths`
 * derives it (the canonical root, so a path spelled through a symbolic link names the same file).
 */
export function openedMarkerFile(userDir: string, root: string): string {
  return join(userDir, "opened", `${sha256(canonical(root)).slice(0, 16)}.json`);
}

export function openedMarkerPath(paths: CrewPaths): string {
  return openedMarkerFile(paths.userDir, paths.root);
}

export function writeOpenedMarker(paths: CrewPaths, marker: OpenedMarker): void {
  writeJson(openedMarkerPath(paths), marker);
}

/** Removes the record of a checkout, by its root (the worktree may be gone by then). */
export function dropOpenedMarker(userDir: string, root: string): void {
  rmSync(openedMarkerFile(userDir, root), { force: true });
}

/** The record for this checkout, or null where there is none or it cannot be read. */
export function readOpenedMarker(paths: CrewPaths): OpenedMarker | null {
  const file = openedMarkerPath(paths);
  if (!existsSync(file)) return null;
  const parsed = readJson<Partial<OpenedMarker>>(file);
  if (!parsed || typeof parsed.mail !== "string" || !parsed.mail) return null;
  return {
    mail: parsed.mail,
    agent: typeof parsed.agent === "string" && parsed.agent ? parsed.agent : "session",
    hops:
      typeof parsed.hops === "number" && Number.isInteger(parsed.hops) && parsed.hops >= 0
        ? parsed.hops
        : 0,
  };
}

function modeOf(value: string | undefined): OpenMode | null {
  return value === "read-only" || value === "branch" ? value : null;
}

/**
 * What opened the session running in `paths`, from the variables first (the hook's are the
 * opener's own; the command's are the session's) and the record where the variables are silent:
 * the record names the opener only for a headless session (`CLAUDE_CODE_SESSION_ATTENDED=0`, as
 * `claude -p` sets it) with no opener variable, never for a person's own session. The branch comes
 * from the variables alone; the mode is the variables', or the branch mode where the record names
 * the opener; the depth is the deeper of the two; the agent is the variables' or the record's.
 */
export function resolveOpener(paths: CrewPaths, env: NodeJS.ProcessEnv): Opener {
  const marker = readOpenedMarker(paths);
  const headless = env.CLAUDE_CODE_SESSION_ATTENDED === "0";
  const fromEnv = env.WIZARDINGCODE_CREW_MAIL_ID?.trim() || null;
  const fromMarker = headless && marker ? marker : null;
  const mail = fromEnv ?? fromMarker?.mail ?? null;
  const envHops = Number(env.WIZARDINGCODE_CREW_MAIL_HOPS ?? "0");
  const hops = Number.isInteger(envHops) && envHops >= 0 ? envHops : 0;
  return {
    mail,
    agent:
      env.WIZARDINGCODE_CREW_MAIL_AGENT?.trim() || (mail ? fromMarker?.agent : null) || "session",
    hops: mail ? Math.max(hops, fromMarker?.hops ?? 0) : hops,
    mode: modeOf(env.WIZARDINGCODE_CREW_MAIL_MODE) ?? (fromEnv || !fromMarker ? null : "branch"),
    branch: env.WIZARDINGCODE_CREW_MAIL_BRANCH?.trim() || null,
  };
}
