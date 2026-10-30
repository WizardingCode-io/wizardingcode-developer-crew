# Improvement run 2026-10-30-4

- At: 2026-10-30T19:00:07.264Z
- Targets: ui-motion-frequency-found, ui-motion-thesis-built
- Provider: runtime (agent claude-sonnet-5-5, judge claude-fable-5-1)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| ui-motion-frequency-found | 0.75, 0.75, 0.75 | 0.75 | 0.00 |
| ui-motion-thesis-built | 0.80, 0.80, 0.80 | 0.80 | 0.00 |

## P-1: refused (the editor changed nothing)

- Diff: none
- Rationale: I changed nothing, because neither failure is in the harness and no edit to `plugins/core/skills/crew/` or `plugins/core/agents/` could make these graders pass for the right reason. The only failure shown for each case is a judge call that threw on the Fable usage limit (`honest-ending` in `ui-motion-frequency-found`, `purposeful-motion` in `ui-motion-thesis-built`), so those graders never judged the run's output. The means fit that one throw with spread 0.00: 0.75 is 3 of 4 graders in every run and 0.80 is 4 of 5, though I inferred those grader counts from earlier scores and did not read the grader files. Both cases also scored 1.00 with these judges earlier today (`docs/evals/2026-10-30-sp9-ui-results.md`, AC-9 and AC-10), though I did not check whether the harness pages have changed since those runs. I ran nothing, so both judge verdicts are still unmeasured and the two cases need a rerun once the Fable quota is available again.

## P-2: refused (the editor changed nothing)

- Diff: none
- Rationale: I changed nothing, because no harness text can fix these two failures. In both cases, the only grader reported as failing is the LLM judge, and it threw `You've reached your Fable limit` before reading the run: `honest-ending` in `ui-motion-frequency-found` and `purposeful-motion` in `ui-motion-thesis-built`. The scores fit that one thrown grader being the only loss, assuming equal weights: 3 of 4 graders give 0.75 and 4 of 5 give 0.80, and the 0.00 spread means every run lost the same amount. So the regex and file graders appear to have passed, though I only have the means and didn't see per-grader results. An edit made now would be a guess with no evidence behind it, since neither ending has been judged and the runs themselves weren't in front of me. The two judge figures need a rerun once the Fable quota for the eval kit's judge is available again, and that rerun will show whether either ending has a real problem; nothing was run or re-measured here.

## Outcome

- Composition: none
- Kept: nothing
- Lessons: none
- Cases no run has measured (never probed): ui-reduced-motion-fails, ui-ux-generic-tells
- Cost: 9.01 USD
- Exit status: 0
