import { readdirSync } from "node:fs";
import { join } from "node:path";
import { readJson } from "./fs.ts";
import { canonical } from "./paths.ts";

/** One part of a mission, written by the session through `crew journey part`. */
export interface JourneyPart {
  id: string;
  text: string;
  state: "open" | "done" | "wait";
  item?: string;
  reason?: string;
}

/** One detached session of a mission. */
export interface JourneySession {
  pid: number;
  processStart: string;
  log: string;
  startedAt: string;
  /** Read after the session ended, once. */
  settled?: boolean;
  failed?: boolean;
  error?: string;
  costUsd?: number;
}

export type JourneyStatus = "running" | "done" | "stopped" | "ended";

/** The record of a mission (ADR 0020), kept in the crew folder a session cannot write. */
export interface JourneyRecord {
  id: string;
  mission: string;
  root: string;
  worktree: string;
  branch: string;
  until: string;
  maxUsd: number;
  allow: string[];
  status: JourneyStatus;
  endedBecause?: string;
  parts: JourneyPart[];
  sessions: JourneySession[];
  failures: number;
  backoffUntil: string | null;
  idleSessions: number;
  /** Parts settled when the last session started, to tell progress from a part merely added. */
  settledAtStart: number;
  remoteRefs: string | null;
  createdAt: string;
}

export const journeysDir = (userDir: string): string => join(userDir, "journeys");
export const journeyDir = (userDir: string, id: string): string => join(journeysDir(userDir), id);
export const journeyFile = (userDir: string, id: string): string =>
  join(journeyDir(userDir, id), "journey.json");

export function readJourney(userDir: string, id: string): JourneyRecord | null {
  return readJson<JourneyRecord>(journeyFile(userDir, id));
}

export function listJourneys(userDir: string): JourneyRecord[] {
  let names: string[] = [];
  try {
    names = readdirSync(journeysDir(userDir));
  } catch {
    return [];
  }
  return names.flatMap((name) => {
    const record = readJourney(userDir, name);
    return record ? [record] : [];
  });
}

/** The running journey whose worktree is this checkout, or null. */
export function journeyForRoot(userDir: string, root: string): JourneyRecord | null {
  const here = canonical(root);
  return (
    listJourneys(userDir).find((j) => j.status === "running" && canonical(j.worktree) === here) ??
    null
  );
}
