# Improvement run 2026-11-08-5

- At: 2026-11-08T17:00:09.528Z
- Targets: spec-isolation, spec-loop-rules
- Provider: runtime (agent claude-sonnet-5-5, judge claude-opus-5-5)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| spec-isolation | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| spec-loop-rules | 1.00, 1.00, 0.67 | 0.89 | 0.33 |

## P-1: refused (the editor changed nothing)

- Diff: none
- Rationale: I changed nothing under `plugins/core/skills/crew/` or `plugins/core/agents/`, because no edit there can reach this case for the right reason. `spec-isolation` is listed at mean 1.00 with no evidence, so it is passing. For `spec-loop-rules`, the `clean-not-zero` grader is a final-message judge that passes only when "rounds 2 and 3 are clean and together count as converged"; every recorded run of the case shows `reads: []`, since its prompt names `wizardingcode-spec-review-loop` and that skill page sits outside the folders I may edit, and nothing in my folders describes a review round (the session-start hook's one pointer, writing.md, is a prose standard this case never opens). The loss is the grader's wording, not the harness: today's commit e03cac3 (finding 227, ADR 0019 point 4) rewrote the loop page and the engine so that a clean round 1 ends the review, round 2 runs only after an unclean round 1, and no two-clean-rounds convergence exists any more (the word survives only in a cli.ts comment), so a lead answering by the current rule says round 1 was already clean, the review ended there, and rounds 2 and 3 are clean but past the end, which the judge's pre-227 rubric fails. The case scored 0.89 with spread 0.33, one run of three losing this one grader while the settled and not-run rules held. The fix is to reword the grader to the finding 227 rule, which is not mine to edit here; I recorded this in memory so later runs do not spend lookups rediscovering it.

## P-2: refused (the editor changed nothing)

- Diff: none
- Rationale: I changed nothing. `spec-isolation` is listed at mean 1.00 with spread 0.00 and no evidence, so it is passing and there is nothing to fix for it. `spec-loop-rules` loses one run in three on `clean-not-zero` alone, and that loss is the grader's, not the harness's: its rubric at `plugins/core/evals/spec-loop-rules/graders/clean-not-zero.md` still asks whether rounds 2 and 3 "together count as converged", while the page the case names, `plugins/core/skills/wizardingcode-spec-review-loop/SKILL.md` rule 6, has said since finding 227 (commit e03cac3, today) that a clean round 1 ends the review and there are at most two rounds, with the word "converged" gone from the page and the engine. A lead answering by the current rule says round 1 is clean and the review over, which the stale wording can read as a FAIL. The case also records `reads: []` on every run and its governing page sits outside the two folders I may edit, so no edit under skills/crew or agents could reach it, and any page carrying "converged" to court the judge would pass for the wrong reason. The fix belongs in the grader: reword `clean-not-zero` to the finding 227 rule, then re-measure.

## Outcome

- Composition: none
- Kept: nothing
- Lessons: none
- Cases no run has measured (never probed): none
- Cost: 3.27 USD
- Exit status: 0
