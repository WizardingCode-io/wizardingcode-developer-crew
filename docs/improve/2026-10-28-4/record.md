# Improvement run 2026-10-28-4

- At: 2026-10-28T19:00:07.315Z
- Targets: pack-nuxt-absent, pack-nuxt-refines-the-gates
- Provider: runtime (agent claude-sonnet-5-5, judge claude-fable-5-1)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| pack-nuxt-absent | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| pack-nuxt-refines-the-gates | 0.57, 1.00, 1.00 | 0.86 | 0.43 |

## P-1: unprobed (the probe set (17 cases, about 62.26 USD by the baseline's costs) is above what is left under the ceiling (12.12 USD); not probed)

- Diff: M plugins/core/skills/crew/references/conclave.md, M plugins/core/skills/crew/references/understand.md
- Rationale: I changed two harness pages and nothing else: `plugins/core/skills/crew/references/understand.md` (the "Decisions only the user can take" bullet and the paragraph that follows it) and `plugins/core/skills/crew/references/conclave.md` (the opening of "Decisions only the user can make"). The failing run of `pack-nuxt-refines-the-gates` is one of three (1.00, 1.00, 0.57 give the recorded mean 0.86 and spread 0.43) in which `pack-gate`, `profile-tag`, `profile-set` and `honest-ending` passed while `gate-ran`, `knowledge-path` and `util-added` failed together, which is the trace of a standard-route run that printed the pack's proposals, set the three relayed gate commands, and then ended honestly before Build: no test gate ran, `crew team` and `crew evidence` never printed `knowledge/nuxt.md`, and `app/utils/slugify.ts` was never written. The harness as it stood led a headless lead there in two ways: the Understand page said unconditionally "Mark the work as waiting (`crew await <id> user`), ask, and end the turn", and the Stop hook releases a waiting turn once, which in the kit ends the session; and both the Understand bullet and the Conclave section told the lead to record every user-only choice with `crew decision <id> add`, while the prompt's choices (the three `node` commands, "take these as my decisions") can only be answered in a headless session as the agent's with `--mode`, which the engine's default `unattendedDecisions: wait` never counts (`decisionCounts` in `policy.ts`), so the guard out of Conclave refuses Plan with "an answer to D-n" and the Conclave page itself said "the item waits for a person". The pages now say that a point the request settles in the user's own words is settled: it goes into the brief's Constraints and the spec, is never re-asked and never recorded as a decision for an answer; that the wait at Understand applies only when something is left to ask, and a request that answers every point and says the user will not be there goes on with `

## P-2: unprobed (the probe set (17 cases, about 62.26 USD by the baseline's costs) is above what is left under the ceiling (9.44 USD); not probed)

- Diff: M plugins/core/skills/crew/references/conclave.md, M plugins/core/skills/crew/references/understand.md
- Rationale: I changed two harness pages and nothing else: `plugins/core/skills/crew/references/understand.md` and `plugins/core/skills/crew/references/conclave.md`. The failing run of `pack-nuxt-refines-the-gates` scored on the pack's proposals, the tag, the confirmed test command and an honest ending, while `gate-ran`, `knowledge-path` and `util-added` all missed together, and the engine shows what that shape is: `crew team <id>` prints `knowledge/nuxt.md` from the profile's targets even before a file changes, so a run with no knowledge path, no `test (.): pass` and no `app/utils/slugify.ts` is one that stopped after the profile was set and before the team was seated, which on the standard route is the Understand phase. The harness as it stood made that stop the obedient move: Understand said, unconditionally, "Mark the work as waiting, ask, and end the turn", and the Conclave's decisions section said an unattended session with a recorded decision and no validator "waits for a person", so a lead facing a prompt that spelled out the util's rule, the three commands and "I will not be here" either asked anyway and ended the turn, or recorded the prompt's answers as decisions it could not count under the default policy, and the kit's single turn ended there with an honest "waiting" message. Understand's paragraph now makes the wait conditional on having something to ask and says that a request answering its own questions with the user absent has decided them, that those answers are constraints and criteria in the request's words and never a recorded decision (which, agent-signed, is not counted and blocks Plan), and that the item is carried through every phase of its route in the same turn, naming `crew team <id>`, the build, the gate run and the delivery; the Conclave's decisions section gains one sentence saying a question the request already answers is a criterion, not a decision, and the round records only what was left open. No test pins the reworded sentences, and every pinn

## Outcome

- Composition: none
- Kept: nothing
- Lessons: none
- Cases no run has measured (never probed): none
- Cost: 10.56 USD
- Exit status: 0
