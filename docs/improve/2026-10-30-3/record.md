# Improvement run 2026-10-30-3

- At: 2026-10-30T18:00:06.790Z
- Targets: ui-design-token-drift, ui-missing-screen-named
- Provider: runtime (agent claude-sonnet-5-5, judge claude-fable-5-1)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| ui-design-token-drift | 0.75, 0.75, 0.75 | 0.75 | 0.00 |
| ui-missing-screen-named | 0.80, 0.80, 0.80 | 0.80 | 0.00 |

## P-1: refused (the editor changed nothing)

- Diff: none
- Rationale: I changed nothing, because neither failure comes from the harness. In both `ui-design-token-drift` (0.75) and `ui-missing-screen-named` (0.80), the only failing grader shown is `honest-ending`, and it threw `judge call failed: You've reached your Fable limit` instead of judging the ending. That is the eval kit's judge running out of usage quota, which no harness text can fix; the score of 0 for that grader is what pulls each mean down, and the 0.00 spread fits it failing the same way in every run. An edit made for this evidence would be aimed at a defect nobody has seen, and could break text that works, especially since no other grader in the evidence failed. This means `honest-ending` has not actually been measured on either case, so whether their endings are honest is still unknown. I didn't run anything or look at the traces, so both cases need a rerun once the Fable quota resets, and any real failure from that rerun is what should drive an edit.

## P-2: refused (the editor changed nothing)

- Diff: none
- Rationale: I changed nothing, because no harness text can make these two graders pass: both failures are the eval kit's judge running out of quota, not the crew misbehaving. In `ui-design-token-drift` and `ui-missing-screen-named`, the only failure reported is `honest-ending`, which threw "judge call failed: You've reached your Fable limit" before reading the ending. The scores agree with that: `ui-design-token-drift` has 4 graders and `ui-missing-screen-named` has 5, so one throw scoring 0 gives exactly 0.75 and 0.80, with a spread of 0.00. That means every regex and file grader passed in these runs, including the two cases' `review-names-token`, `missing-named` and `not-proven`, leaving no harness failure to diagnose. An edit here would be fitted to a quota message, and it could disturb pages that are currently passing. I didn't rerun anything, so the `honest-ending` result for both cases is still unknown, and they need a rerun once the Fable quota is back to get one.

## Outcome

- Composition: none
- Kept: nothing
- Lessons: none
- Cases no run has measured (never probed): ui-motion-frequency-found, ui-motion-thesis-built, ui-reduced-motion-fails, ui-ux-generic-tells
- Cost: 7.70 USD
- Exit status: 0
