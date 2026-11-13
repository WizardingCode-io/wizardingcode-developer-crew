import { rmSync } from "node:fs";
import { join } from "node:path";
import { nowIso } from "./fs.ts";
import { withLock } from "./lock.ts";
import type { CrewPaths } from "./paths.ts";
import { readProtectedJson, writeProtectedJson } from "./store.ts";
import type { Evidence, RoleRecord, WorkItem } from "./types.ts";

/**
 * The runtime's witness of a role (finding 243). In Claude Code the plugin's mod is handed each
 * spawn of a subagent inside the runtime's process and tells the engine (`crew hook agent-spawn`);
 * the engine keeps one entry per spawn in the project's witness log, and the filing of that agent
 * id and role spends it and is marked `witnessed`. The mark says the mod saw that agent id
 * spawned; it is not proof of who filed (finding 213 holds what stays open). A filing with no
 * witness is recorded and counts as before: the readers name it, nothing refuses it.
 */
interface WitnessEntry {
  agentId: string;
  /** The role, as `roleOf` reads it from the agent's type. */
  agent: string;
  at: string;
}

interface WitnessLog {
  entries: WitnessEntry[];
}

/** The latest spawns the log keeps: more than a session's roles in flight, few enough to read at every stop. */
const WITNESS_LOG_MAX = 500;

const LOCK = { what: "witness log" };

function witnessDir(paths: CrewPaths): string {
  return join(paths.localDir, "witness");
}

function logFile(paths: CrewPaths): string {
  return join(witnessDir(paths), "log.json");
}

function isEntry(value: unknown): value is WitnessEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.agentId === "string" &&
    typeof entry.agent === "string" &&
    typeof entry.at === "string"
  );
}

/** The log's entries as the engine wrote them; null when the file cannot be read, does not parse, is off its shape or was changed outside the engine. Called under the log's lock. */
function readEntries(paths: CrewPaths): WitnessEntry[] | null {
  const read = readProtectedJson<WitnessLog>(paths, logFile(paths));
  if (read.tampered) return null;
  if (read.data === null) return [];
  const entries: unknown = read.data.entries;
  return Array.isArray(entries) && entries.every(isEntry) ? entries : null;
}

/**
 * A spawn the runtime told of: one entry appended, the log cut to its latest entries, all under
 * the log's lock since roles are launched in parallel. A log the engine cannot trust is started
 * again with this entry alone, so an entry a hand wrote never becomes the engine's. A lock or a
 * write that fails throws: the hook's dispatcher answers `{}` for it, and the role is then filed
 * with no witness and named, while `spendWitness` below must not throw inside a filing.
 */
export function recordSpawn(paths: CrewPaths, agentId: string, agent: string): void {
  withLock(
    witnessDir(paths),
    () => {
      const kept = readEntries(paths);
      // A file that cannot be read may not be writable in place either: it is replaced.
      if (kept === null) rmSync(logFile(paths), { force: true });
      const entries = [...(kept ?? []), { agentId, agent, at: nowIso() }];
      writeProtectedJson(paths, logFile(paths), { entries: entries.slice(-WITNESS_LOG_MAX) });
    },
    LOCK,
  );
}

/**
 * Whether the runtime witnessed this agent id as this role, spending the entry: one witness marks
 * one filing, so the filing a script makes with a real role's id after that role stopped is not
 * marked. Never throws: whatever state the log is in, the filing goes on with no mark.
 */
export function spendWitness(paths: CrewPaths, agentId: string, agent: string): boolean {
  try {
    return withLock(
      witnessDir(paths),
      () => {
        const entries = readEntries(paths);
        if (entries === null) return false;
        const at = entries.findIndex((e) => e.agentId === agentId && e.agent === agent);
        if (at === -1) return false;
        writeProtectedJson(paths, logFile(paths), { entries: entries.filter((_, n) => n !== at) });
        return true;
      },
      LOCK,
    );
  } catch {
    return false;
  }
}

/** Whether a role record is a tech lead's: the agent `tech-lead`, or `tech-lead-<n>` for an answer with no heading. */
export function isTechLead(record: RoleRecord): boolean {
  return record.agent === "tech-lead" || record.agent.startsWith("tech-lead-");
}

/** A role record's name in a line: every lead is the agent tech-lead, so its team tells two leads apart. */
export function roleLabel(record: RoleRecord): string {
  return isTechLead(record) && record.team !== undefined
    ? `${record.agent} (${record.team})`
    : record.agent;
}

/** A filing the hook made: an answer on disk, not the session's own. */
function isHookFiling(record: RoleRecord): boolean {
  return record.file !== null && record.filedBy !== "session";
}

export const NO_WITNESS_ON_ITEM =
  "no runtime witness on this item: its role filings rest on the hook's payload alone";

/**
 * What a reader says of an item's hook filings, worked out when it runs. With at least one
 * witnessed, the others are named; with none witnessed, one line names the item (a runtime with
 * no module in its process, or a session before the mod); with no hook filing, nothing.
 */
export function witnessLine(roles: readonly RoleRecord[]): string {
  const filed = roles.filter(isHookFiling);
  if (!filed.length) return "";
  if (!filed.some((r) => r.witnessed)) return NO_WITNESS_ON_ITEM;
  const names = [...new Set(filed.filter((r) => !r.witnessed).map(roleLabel))];
  return names.length ? `answers with no runtime witness: ${names.join(", ")}` : "";
}

/**
 * The answers a verdict rests on whose role record has no witness: each lead whose latest
 * validation of the spec or of the delivery reads a hook filing with no mark, and the judge when
 * a ruling is on record and its latest filing has none. Empty for an item whose answers are all
 * witnessed or the session's own.
 */
function unwitnessedAnswers(work: WorkItem, evidence: Evidence): string[] {
  const roles = evidence.roles ?? [];
  const names: string[] = [];
  const latest = new Map<string, { what: string; by: string; file: string }>();
  for (const v of work.validations ?? []) if (v.what !== "plan") latest.set(`${v.what} ${v.by}`, v);
  for (const v of latest.values()) {
    const record = roles.filter((r) => r.file === v.file).at(-1);
    if (record && isHookFiling(record) && !record.witnessed) names.push(`${v.by} (${v.what})`);
  }
  if (evidence.judgement?.length) {
    const judge = roles.filter((r) => r.agent === "judge" && r.file !== null).at(-1);
    if (judge && isHookFiling(judge) && !judge.witnessed) names.push("judge");
  }
  return names;
}

/** The verdict written on its record with the names it rests on that have no witness; the field is absent when there are none. */
export function stampVerdict(
  evidence: Evidence,
  verdict: { verdict: "proven" | "unproven"; unproven: string[] },
  work: WorkItem,
): void {
  evidence.verdict = verdict.verdict;
  evidence.unproven = verdict.unproven;
  const names = unwitnessedAnswers(work, evidence);
  if (names.length) evidence.unwitnessed = names;
  else delete evidence.unwitnessed;
}
