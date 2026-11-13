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
  /** The session the runtime's payload named at the spawn (finding 183); absent when it named none, and on an entry from before. */
  sessionId?: string;
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
    typeof entry.at === "string" &&
    (entry.sessionId === undefined || typeof entry.sessionId === "string")
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
export function recordSpawn(
  paths: CrewPaths,
  agentId: string,
  agent: string,
  sessionId?: string,
): void {
  withLock(
    witnessDir(paths),
    () => {
      const kept = readEntries(paths);
      // A file that cannot be read may not be writable in place either: it is replaced.
      if (kept === null) rmSync(logFile(paths), { force: true });
      const entry: WitnessEntry = {
        agentId,
        agent,
        at: nowIso(),
        ...(sessionId ? { sessionId } : {}),
      };
      const entries = [...(kept ?? []), entry];
      writeProtectedJson(paths, logFile(paths), { entries: entries.slice(-WITNESS_LOG_MAX) });
    },
    LOCK,
  );
}

/**
 * Whether the runtime witnessed this agent id as this role, spending every entry of that id and
 * role: a role resumed after a stop with no answer holds two, and one left behind would mark a
 * later filing with its id. The caller asks only for a filing that saved an answer, so a stop with
 * no answer leaves its entry for the role's next filing; until then, or until later spawns push it
 * out, a script that files with that id and role takes the mark (finding 213's second point).
 * After a filing with an answer, no later filing with that id is marked without a new spawn.
 * Never throws: whatever state the log is in, the filing goes on with no mark.
 */
export function spendWitness(paths: CrewPaths, agentId: string, agent: string): boolean {
  try {
    return withLock(
      witnessDir(paths),
      () => {
        const entries = readEntries(paths);
        if (entries === null) return false;
        const others = entries.filter((e) => e.agentId !== agentId || e.agent !== agent);
        if (others.length === entries.length) return false;
        writeProtectedJson(paths, logFile(paths), { entries: others });
        return true;
      },
      LOCK,
    );
  } catch {
    return false;
  }
}

/**
 * The entries of roles launched and not yet answered (finding 183): unspent, of the session given
 * (of any session, and of none, when no session is given), with no end of that agent on the item's
 * record at or after the entry's time, so a role that stopped with no answer, whose entry stays, is
 * not out. An entry with no session id is no session's. Null when the log cannot be trusted or
 * read; never throws, and takes no lock of its own: it is read at a turn's end beside roles that
 * write it.
 */
export function entriesOut(
  paths: CrewPaths,
  sessionId: string | null,
  roles: readonly RoleRecord[],
): WitnessEntry[] | null {
  let entries: WitnessEntry[] | null;
  try {
    entries = readEntries(paths);
  } catch {
    return null;
  }
  if (entries === null) return null;
  return entries.filter(
    (e) =>
      (sessionId === null || e.sessionId === sessionId) &&
      !roles.some((r) => r.agentId === e.agentId && r.at >= e.at),
  );
}

/** Entries counted by role, each role once with how many of it, in the order they were launched. */
export function countRoles(
  entries: readonly { agent: string }[],
): { agent: string; count: number }[] {
  const counted = new Map<string, number>();
  for (const entry of entries) counted.set(entry.agent, (counted.get(entry.agent) ?? 0) + 1);
  return [...counted].map(([agent, count]) => ({ agent, count }));
}

/** The roles out by role and count; none when the log cannot be trusted. */
export function rolesOut(
  paths: CrewPaths,
  sessionId: string | null,
  roles: readonly RoleRecord[],
): { agent: string; count: number }[] {
  return countRoles(entriesOut(paths, sessionId, roles) ?? []);
}

/**
 * The roles out as a reader names them: by the role's name, which the engine's own list bounds, and
 * a count when a role is out more than once (`tech-lead (2), judge`). Never an entry's agent id or
 * session id: those come from a payload taken on trust, and the text is read as the engine's own.
 */
export function rolesOutText(out: readonly { agent: string; count: number }[]): string {
  return out.map((r) => (r.count > 1 ? `${r.agent} (${r.count})` : r.agent)).join(", ");
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
