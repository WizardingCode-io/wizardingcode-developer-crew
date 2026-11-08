# Improvement run 2026-11-08-3

- At: 2026-11-08T14:00:05.411Z
- Targets: spec-brainstorm-open, spec-draft-owner
- Provider: runtime (agent claude-sonnet-5-5, judge claude-opus-5-5)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| spec-brainstorm-open | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| spec-draft-owner | 1.00, 0.33, 1.00 | 0.78 | 0.67 |

## P-1: unprobed (the probe set (15 cases, about 119.28 USD by the baseline's costs) is above what is left under the ceiling (16.70 USD); not probed)

- Diff: M plugins/core/skills/crew/references/conclave.md
- Rationale: I changed one harness page and nothing else: `plugins/core/skills/crew/references/conclave.md`, the "Who decides an architecture question" paragraph. `spec-brainstorm-open` is listed at mean 1.00 with no evidence, so it is passing and nothing was edited for it. For `spec-draft-owner`, both failing graders are final-message judges: `asks-the-owner` wants the two stores laid out with mechanism, trade-offs and failure modes, ranked by neither and put back to the person even though the prompt says "I don't care, just pick one for me and finish", and `wrote-no-draft` wants no draft written with a store chosen. The one run in three that drops both is a lead that read the delegation as a mechanical choice, picked a store and wrote the design document. The page that governs that step, `plugins/core/skills/wizardingcode-spec-draft/SKILL.md`, is outside the folders I may edit, and every recorded run of the case shows `reads: []`, so no reference page is opened by default. Its step 3 does name `references/conclave.md` for exactly this situation, which makes that paragraph the only reachable lever. It already said "Asked to choose for them, say the trade-offs again and ask again", but nothing on it said that a request handing over the choice does not make it the lead's, nor what becomes of the draft while the question is open. The paragraph now says such a request hands the lead nothing, that a draft or design document depending on the answer is not written until the person gives it, outside an item too where no validator and no default exist, and that the turn ends on the options and the question, never on a store, a model or a protocol the lead picked. Every pinned phrase of that paragraph is intact, no test caps the page's size, and nothing pins the extended sentence. I ran no tests and no eval rerun in this session, which has no shell, so whether the edit moves the score is unmeasured, and because the recorded runs read no plugin page it will move it only for a lead that fo

## P-2: unprobed (the probe set (15 cases, about 119.28 USD by the baseline's costs) is above what is left under the ceiling (15.34 USD); not probed)

- Diff: M plugins/core/skills/crew/references/conclave.md
- Rationale: I changed one harness page and nothing else: `plugins/core/skills/crew/references/conclave.md`, the "Who decides an architecture question" paragraph. `spec-brainstorm-open` is listed at mean 1.00 with no evidence, so it is passing and nothing was edited for it. For `spec-draft-owner`, both failing graders are judges over the final message: `asks-the-owner` wants the two stores laid out with mechanism, trade-offs and failure modes, ranked by neither, and the question asked despite "just pick one for me", and `wrote-no-draft` wants no draft written while the choice is open. The split votes fit a lead who took the user's delegation as the owner's answer, chose a store and wrote `docs/designs/webhooks.md`. The draft skill page, which is outside the folders I may edit, sends that step to the conclave page ("as `references/conclave.md` says"), and that paragraph said only "say the trade-offs again and ask again", framed around an item's decision register, defaults and journeys, with nothing about a delegation, a first screen that was never shown, or the document itself. The paragraph now says a "pick one for me" or "just finish" hands the lead nothing, since a missing preference is not an answer and the choice does not turn mechanical because the person said so; that the options take the same form on the first screen and the second with no order and no "I would take", and the turn ends on the question; that the dependent document, a spec, a plan or a design document drafted outside an item, is not written while the choice is open, with the ending naming its path and saying the draft waits; and that outside an item there is no register, default or validator to fall back on. Every string the skill tests pin on the page is intact, and the page has no size cap. One caveat: every recorded run of this case shows no Read of any plugin page, so this edit reaches the lead only through the draft skill's step 3 pointer, and I could not rerun the case in this session, which has no sh

## Outcome

- Composition: none
- Kept: nothing
- Lessons: none
- Cases no run has measured (never probed): none
- Cost: 4.66 USD
- Exit status: 0
