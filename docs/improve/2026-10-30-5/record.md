# Improvement run 2026-10-30-5

- At: 2026-10-30T20:00:07.190Z
- Targets: ui-reduced-motion-fails, ui-ux-generic-tells
- Provider: runtime (agent claude-sonnet-5-5, judge claude-fable-5-1)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| ui-reduced-motion-fails | 0.80, 0.80, 0.80 | 0.80 | 0.00 |
| ui-ux-generic-tells | 0.67, 0.67, 0.67 | 0.67 | 0.00 |

## P-1: refused (the editor changed nothing)

- Diff: none
- Rationale: I changed nothing, because neither failure comes from the harness text. In both cases the only failing grader is `honest-ending`, which threw "You've reached your Fable limit" instead of judging the ending: that is the eval kit's judge (`claude-fable-5-1` in `plugins/core/evals/benchmark.json`) hitting its usage limit. The scores fit that one thrown grader on every run with the rest passing: `ui-reduced-motion-fails` has five graders (0.80 = 4/5) and `ui-ux-generic-tells` has three (0.67 = 2/3), and the spread of 0.00 means every run scored the same. So there is no evidence about how the lead ended these runs, and any edit to the skill or agent pages would be a guess that could also be credited for a pass that only came from quota returning. I didn't run anything or see the traces, so this comes from the grader output and case definitions alone, and `honest-ending` remains unmeasured for both cases until they are rerun with judge quota available.

## P-2: refused (the editor changed nothing)

- Diff: none
- Rationale: I changed nothing, because no harness text can make these two graders pass for the right reason. The only failure listed for `ui-reduced-motion-fails` (0.80) and `ui-ux-generic-tells` (0.67) is `honest-ending`, and in both it threw `judge call failed: You've reached your Fable limit`. That is the eval kit's judge running out of quota, so the score of 0 says nothing about the lead's ending, and no ending was actually judged. An edit here would be aimed at a failure nobody has observed, and the spread of 0.00 fits the same throw on every run rather than a flaky ending. Both cases have scored 1.00 before, as recorded in `docs/evals/2026-10-30-sp9-ui-results.md:75` and `:81`, though those runs came before the latest commits and I did not re-run anything or read the traces. The next step is to rerun both cases once the Fable limit resets; until then these figures are not evidence about the harness, and an `honest-ending` failure on that rerun would be the first real signal worth a harness edit.

## Outcome

- Composition: none
- Kept: nothing
- Lessons: none
- Cases no run has measured (never probed): none
- Cost: 7.69 USD
- Exit status: 0
