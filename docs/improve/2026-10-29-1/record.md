# Improvement run 2026-10-29-1

- At: 2026-10-29T00:00:05.694Z
- Targets: pack-next-absent, pack-next-refines-the-gates
- Provider: runtime (agent claude-sonnet-5-5, judge claude-fable-5-1)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| pack-next-absent | 1.00, 0.83, 1.00 | 0.94 | 0.17 |
| pack-next-refines-the-gates | 1.00, 1.00, 1.00 | 1.00 | 0.00 |

## P-1: unprobed (the probe set (17 cases, about 70.32 USD by the baseline's costs) is above what is left under the ceiling (13.00 USD); not probed)

- Diff: M plugins/core/skills/crew/references/conclave.md, M plugins/core/skills/crew/references/understand.md
- Rationale: Nothing pins the extended sentences and no size cap applies to the reference pages, so the edits are complete.

I changed two harness pages and nothing else: `plugins/core/skills/crew/references/understand.md` and `plugins/core/skills/crew/references/conclave.md`. The `util-added` grader of `pack-next-absent` reads `lib/slugify.ts` from the checkout, and the one failing run of three had no such file while its ending still passed the honesty judge, which is the shape of a standard-route feature that stopped honestly before build. The engine makes that the natural end once the lead records anything as a wait with nobody present: the default policy is `unattendedDecisions: wait`, so a decision answered by the agent under `--mode` is not counted, Plan is refused, and the Stop hook lets the turn end on `crew await user`. The request names the user as away and its words as the decisions, yet the Understand page said unconditionally to mark the work waiting, ask, and end the turn, and the Conclave's decisions section said to record every choice two engineers would build differently (the "letters" reading the QA lead raised in the kit run is exactly such a choice). The Understand page's wait paragraph now says that a request which states its decisions and says not to wait leaves nothing to wait for: the assumptions go in the brief with the request's words as their confirmation, a choice those words settle is read as settled, and `crew phase <id> next` follows in the same turn, while a choice the words leave open is still recorded and waited for. The Conclave's decisions paragraph says the same from its side: a choice the request already answers is an assumption of the spec, not a decision, since under the default policy a recorded one gets no counted answer and the item ends with nothing built. Every pinned string of both pages is intact, and no reference page has a size cap. I could not see the failing run's trace, so the cause is inferred from the engine's policy default 

## P-2: unprobed (the probe set (17 cases, about 70.32 USD by the baseline's costs) is above what is left under the ceiling (10.75 USD); not probed)

- Diff: M plugins/core/skills/crew/references/conclave.md, M plugins/core/skills/crew/references/understand.md
- Rationale: Nothing pins the rewritten sentences, and every pinned string on both pages (the Understand bullets and their wording, the Conclave headings, `crew await <id> user`, the validator and Jev lines) sits in text I did not touch.

I changed two harness pages and nothing else: `plugins/core/skills/crew/references/understand.md` (the paragraph after the Understand bullets) and `plugins/core/skills/crew/references/conclave.md` (the opening of "Decisions only the user can make"). The failing run of `pack-next-absent` lost only `util-added`, which threw because `lib/slugify.ts` was never written, while the four `not_contains` graders and the `honest-ending` judge passed, so the lead went the standard route, ended honestly, and never reached Build. The prompt spells out the util's rule and the test command and says "I will not be here; take these as my decisions and carry the work through", yet the Understand page said, unconditionally, "Mark the work as waiting, ask, and end the turn", and the Stop hook lets a waiting turn end once, which in the kit ends the session before a line of code. The Conclave page added a second trap: it told the lead to record every user-only choice with `crew decision <id> add`, and a decision answered by an agent under the default `unattendedDecisions: wait` is not counted, so Plan is refused and the page's own last line says the item waits for a person. The same stop shape was diagnosed on the nuxt pair in run 2026-10-28-4 but never probed for cost, and the pages were unchanged since. Understand now says a point the request settles in the user's words is settled (a constraint and a criterion, never re-asked and never a decision recorded for an answer), that the wait applies only when something is left to ask, and that a request answering every point with the user absent is carried through every phase of its route in the same turn, naming the spec, the gap round, `crew team <id>`, the build, the gate run and the delivery. Conclave gains the matchi

## Outcome

- Composition: none
- Kept: nothing
- Lessons: none
- Cases no run has measured (never probed): none
- Cost: 9.25 USD
- Exit status: 0
