# 0024. A kept run that was not ruled is named for a person

- Status: accepted (the user, 2026-11-11: decisions D-1 and D-3 of item 2026-11-11-002; D-3 replaced D-2).
- Date: 2026-11-11

## Context

The improvement loop keeps a harness change whose figures win and then adopts it: a gate in code, a judge's ruling on the diff, a merge and a patch release (ADR 0015, decision 3). The kept change stays on its branch as evidence whatever the adoption does.

Three endings of the adoption rule nothing: no judge candidate answers its probe, every candidate is at its limit during the ruling, or the judge's call fails for another cause. The run then stayed on its branch and nothing offered it again: the loop's `lastRun` had moved past it, and the notification named neither the branch nor what a person could do. Finding 233 recorded this, with the cause's text that a run not judged left in the published record.

## Decision

1. **The loop never offers a run a second time.** A run whose adoption ruled nothing is not adopted by a later tick.
2. **The tick names the run for a person.** `adoptRun` answers `notRuled: true` on those three endings and on no other. For a run measured on Claude models the tick adds to its notification and its log `the run was not ruled and its branch <branch> is kept: adopt it by hand (docs/improve/README.md)`. No state is written and `status` prints nothing new.
3. **A run measured on a provider that is not Claude models is never named.** Decision 3 of ADR 0015 releases only a run measured on Claude models, and the adoption's not-ruled endings return before its check of the provider.
4. **A person adopts by the README's section** (`docs/improve/README.md`, "Adopting a kept run by hand"): the loop stopped and its tick ended, no pending release, main unchanged outside `docs/` since the run; then the reading of the gate and the diff, the merge, the release script, the branch deleted on origin, and `resume`.
5. **The published record of a run not judged holds the class of the cause alone** (D-1): `limited`, `overloaded` or `failed`, the words the judge probe already publishes, chosen by the user over "limit, overload, other". The CLI's text goes to the local log.

## Alternatives weighed

- **One bounded second offer by the loop** (D-2, the user's first answer: yes, but never circling). It was designed with a slot in the state, a wait of 24 hours and a rule that the offer is made only on a main that has not moved beyond `docs/` since the first, which the stale check of finding 172 requires. Measured on 2026-11-11: main moved beyond `docs/` on 28 of the last 30 days, in 151 distinct hours. Nearly every waiting offer would have ended without an adoption, for a state slot, a nine-step phase of the tick, ten endings and about twenty test rows on the loop's automatic release path. The user chose D-3 in its place.
- **The second offer without the rule on main.** It would adopt a change whose figures were measured on a tree that is no longer main's.
- **A `not ruled:` line in `status`**, held by a slot of the state. Nothing would clear it but a merge of that very branch, so it would stay after main moved and the run could no longer be adopted.

## Consequences

- A hand adoption puts the person in the judge's place: the clause "no rule of the method weakened" was never ruled for that run, and whoever merges answers for it.
- Nothing in code keeps a hand adoption from colliding with the loop; the README's first two preconditions do.
- A release made by hand is not in the loop's state. The README gives the way back from each step: the merge dropped before the release, a release resumed by hand after its push with the loop still stopped, and a finished release undone by a revert of the merge and a new patch.
- Most runs that are not ruled will not be adopted at all, since main moves beyond `docs/` on most days: the next due tick measures again, which is the loop's rule and costs a run.
- The other endings that leave a kept branch (main moved during the run, a ruling of "does not hold", a provider that is not Claude models, a failed merge, a release that did not finish) are as they were: their reasons say what happened.
- No adoption had ended "not ruled" when this was decided, so the path is carried by tests alone until one does.
