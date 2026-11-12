import { whoDecides } from "./evidence.ts";
import { decisionCounts } from "./policy.ts";
import { oneLine } from "./state.ts";
import { isPermissionMode, type Policy, type WorkItem } from "./types.ts";

type Continued = NonNullable<WorkItem["continued"]>[number];

/** The entries of one target recorded by one author: `rounds` is their count, the rounds past the cap. */
export interface ContinuationGroup {
  what: string;
  task?: string;
  by: string;
  standing: boolean;
  counted: boolean;
  rounds: number;
}

/** The entries the engine wrote, grouped; the count of the entries no writer of the engine makes; and how many the record holds in all. */
export interface ContinuationGroups {
  groups: ContinuationGroup[];
  offShape: number;
  entries: number;
}

export interface ContinuationsView {
  line: string;
  data: {
    policy: Policy["team"]["continuations"];
    onRecord: ContinuationGroup[];
    /** The entries off the shape the engine writes; absent when there is none. */
    offShape?: number;
  };
}

const STANDING = "the standing grant";
const WHATS: readonly string[] = ["judgement", "validation", "gate"];
const TASK = /^T-\d+$/;

/**
 * Whether an entry of `work.continued` is one the engine writes (finding 241). `crew continue`
 * writes `what` from three words, a task matching `T-<n>` for a gate alone, and as author the user
 * (relayed or not) or the agent in a permission mode; the standing grant writes the user. Any
 * other entry reached the record by a hand edit: the status counts it and prints nothing of it,
 * and the grant reads no round from it, so the line and the grant cannot disagree about an entry.
 */
export function isEngineEntry(entry: unknown): entry is Continued {
  if (typeof entry !== "object" || entry === null) return false;
  const e = entry as Record<string, unknown>;
  if (typeof e.what !== "string" || !WHATS.includes(e.what)) return false;
  // A task, of the writer's shape, exactly when a gate is continued.
  const taskFits =
    e.what === "gate" ? typeof e.task === "string" && TASK.test(e.task) : e.task === undefined;
  // The writers set `standing: true` or leave it out.
  const standing = e.standing === true;
  if (!taskFits || (e.standing !== undefined && !standing)) return false;
  if (typeof e.by !== "object" || e.by === null) return false;
  const by = e.by as Record<string, unknown>;
  if (by.rule !== undefined) return false;
  if (by.by === "user") return by.mode === undefined;
  // The agent in a permission mode, never relayed, and never the author of a standing entry.
  return by.by === "agent" && isPermissionMode(by.mode) && by.relayed === undefined && !standing;
}

/** The entries the engine wrote, grouped by what they continued and by who recorded them, and the count of the others. */
export function continuationGroups(work: WorkItem, policy: Policy): ContinuationGroups {
  const groups: ContinuationGroup[] = [];
  let offShape = 0;
  for (const entry of work.continued ?? []) {
    if (!isEngineEntry(entry)) {
      offShape++;
      continue;
    }
    const standing = entry.standing === true;
    const by = standing ? STANDING : oneLine(whoDecides(entry.by));
    const found = groups.find((g) => g.what === entry.what && g.task === entry.task && g.by === by);
    if (found) found.rounds++;
    else
      groups.push({
        what: entry.what,
        ...(entry.task === undefined ? {} : { task: entry.task }),
        by,
        standing,
        counted: decisionCounts(policy, entry.by),
        rounds: 1,
      });
  }
  return { groups, offShape, entries: work.continued?.length ?? 0 };
}

/**
 * The line `crew status` prints of the rounds past a cap (finding 216): the groups by target, the
 * count of entries off the shape, then the policy's standing grant. `none on record` is for a
 * record with no entry at all, never for one whose entries are all off the shape. Null when
 * there is nothing to say: no entry and the policy at `ask`.
 */
export function continuationsLine(
  grouped: ContinuationGroups,
  policy: Policy["team"]["continuations"],
): string | null {
  const granted = policy === "granted";
  const { entries } = grouped;
  if (!entries && !granted) return null;
  const targetOf = (g: ContinuationGroup) =>
    g.task === undefined ? g.what : `${g.what} ${g.task}`;
  const targets = [...new Set(grouped.groups.map(targetOf))];
  const parts = targets.map((target) => {
    const mine = grouped.groups.filter((g) => targetOf(g) === target).map(groupText);
    return `${target}: ${mine.join(", ")}`;
  });
  if (grouped.offShape)
    parts.push(
      `${grouped.offShape} ${grouped.offShape === 1 ? "entry" : "entries"} off the shape the engine writes`,
    );
  if (!entries) parts.push("none on record");
  if (granted)
    parts.push("team.continuations is granted: a round past a cap needs no crew continue");
  return `  continuations: ${parts.join("; ")}`;
}

/**
 * What `crew status` says of the rounds past a cap: a session reads here what `continueOrRefuse`
 * will grant, so a group the policy does not count says so and is never worded as the user's.
 * Null when there is nothing to say.
 */
export function continuationsView(work: WorkItem, policy: Policy): ContinuationsView | null {
  const grouped = continuationGroups(work, policy);
  const line = continuationsLine(grouped, policy.team.continuations);
  if (line === null) return null;
  return {
    line,
    data: {
      policy: policy.team.continuations,
      onRecord: grouped.groups,
      ...(grouped.offShape ? { offShape: grouped.offShape } : {}),
    },
  };
}

function groupText(group: ContinuationGroup): string {
  if (group.standing) return `${group.rounds} under ${STANDING}`;
  return `${group.rounds} by ${group.by}${group.counted ? "" : " (not counted under the policy)"}`;
}
