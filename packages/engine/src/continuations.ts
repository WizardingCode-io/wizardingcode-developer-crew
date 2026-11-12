import { whoDecides } from "./evidence.ts";
import { decisionCounts } from "./policy.ts";
import { oneLine } from "./state.ts";
import type { Policy, WorkItem } from "./types.ts";

/** The entries of one target recorded by one author: `rounds` is their count, the rounds past the cap. */
export interface ContinuationGroup {
  what: string;
  task?: string;
  by: string;
  standing: boolean;
  counted: boolean;
  rounds: number;
}

export interface ContinuationsView {
  line: string;
  data: { policy: Policy["team"]["continuations"]; onRecord: ContinuationGroup[] };
}

const STANDING = "the standing grant";

/**
 * What `crew status` says of the rounds past a cap (finding 216): the item's `continued` entries
 * grouped by target and by who recorded them, and the policy's standing grant. A session reads
 * here what `continueOrRefuse` will grant, so a group the policy does not count says so and is
 * never worded as the user's. Null when there is nothing to say: no entry and the policy at `ask`.
 * Every printed value passes through `oneLine`: the record's writers check them, a hand edit does not.
 */
export function continuationsView(work: WorkItem, policy: Policy): ContinuationsView | null {
  const granted = policy.team.continuations === "granted";
  const groups: ContinuationGroup[] = [];
  for (const entry of work.continued ?? []) {
    const what = oneLine(String(entry.what));
    const task = entry.task === undefined ? undefined : oneLine(String(entry.task));
    const standing = entry.standing === true;
    const by = standing ? STANDING : oneLine(whoDecides(entry.by));
    const found = groups.find((g) => g.what === what && g.task === task && g.by === by);
    if (found) found.rounds++;
    else
      groups.push({
        what,
        ...(task === undefined ? {} : { task }),
        by,
        standing,
        counted: decisionCounts(policy, entry.by),
        rounds: 1,
      });
  }
  if (!groups.length && !granted) return null;
  const targetOf = (g: ContinuationGroup) =>
    g.task === undefined ? g.what : `${g.what} ${g.task}`;
  const targets = [...new Set(groups.map(targetOf))];
  const parts = targets.map((target) => {
    const mine = groups.filter((g) => targetOf(g) === target).map(groupText);
    return `${target}: ${mine.join(", ")}`;
  });
  if (!parts.length) parts.push("none on record");
  if (granted)
    parts.push("team.continuations is granted: a round past a cap needs no crew continue");
  return {
    line: `  continuations: ${parts.join("; ")}`,
    data: { policy: policy.team.continuations, onRecord: groups },
  };
}

function groupText(group: ContinuationGroup): string {
  if (group.standing) return `${group.rounds} under ${STANDING}`;
  return `${group.rounds} by ${group.by}${group.counted ? "" : " (not counted under the policy)"}`;
}
