# 0020. A journey works on a mission with nobody present

- Status: accepted (the user, 2026-10-31). Extends ADR 0005, ADR 0012 and ADR 0015.
- Date: 2026-10-31

## Context

The crew runs with a person, relaying their word, or unattended, where a rule covers the decision and anything else waits. An unattended item stops on the first decision no rule covers, and a session ends at a usage limit. The user asked for a mode that lets them rest while everything keeps working on a given mission. The design is `docs/specs/2026-10-31-sp10-spec-review-and-journey-design.md`, §5 and §6.

## Decision

1. **`crew journey start "<mission>"`** runs detached `claude -p` sessions under launchd, reusing the opener and the loop's backoff. A usage limit or an error pauses and resumes.
2. **A mission splits into crew items with the same gates.** A journey weakens no gate.
3. **What no rule can decide never stops the mission and is never guessed.** The validator applies a recorded conservative default and the decision heads the report. With no default, or when it changes a gate or a risk area, or on an `ESCALATE`, the item waits and the mission moves on.
4. **The work stays on one branch.** No push, release or deploy by what the hook can read: `--allow` names push alone in this release. What a granted runner does is out of the hook's sight, so a push is also redirected in the session's environment and the report compares the remote's refs from the start. The validator still cannot waive an objection.
5. **The end is a report**: what was proven, what was not and why, the decisions taken without the person, the cost.

## Consequences

- A person returns to a branch and a report, and any decision taken without them can be reversed before it leaves the machine.
- Part of a mission can come back undone, by design: an item waiting for a decision is reported, never pushed through.
- The Mac stays on and awake. launchd makes this macOS only until a user of another system asks.
- A mission spends without a person watching. `--until` (12 hours by default) and `--max-usd` (60 by default) bound it, as do 50 sessions and three sessions with no progress, and the report states the cost. The user's standing word that quality comes before run limits is about the evals they ask for; a mission with nobody watching is bounded by default and the person raises it at the start.
