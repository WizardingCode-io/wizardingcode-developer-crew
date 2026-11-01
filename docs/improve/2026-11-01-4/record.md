# Improvement run 2026-11-01-4

- At: 2026-11-01T16:00:08.786Z
- Targets: spec-isolation, spec-loop-rules
- Provider: runtime (agent claude-sonnet-5-5, judge claude-opus-5-5)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| spec-isolation | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| spec-loop-rules | 1.00, 1.00, 1.00 | 1.00 | 0.00 |

## P-1: refused (the editor changed nothing)

- Diff: none
- Rationale: Neither grader is failing, so I changed nothing. The brief lists `spec-isolation` and `spec-loop-rules` at a mean of 1.00 with no spread and "none" for evidence, and the latest improvement record at `docs/improve/2026-11-01-3/record.md` lists both cases under "never probed", so there is no failing run, no trace and no CTO plan to work from. Their case files declare only a fixture script and no graders I can read against the harness, and a lesson in this kit says a passing grader must not be re-explained or touched. Any edit to `plugins/core/skills/crew/` or `plugins/core/agents/` here would be a guess with nothing to pass for the right reason and a risk to the pinned strings the skill tests hold, so the smallest correct change is none. The next useful step is a measured run of the two spec cases so a later improvement has a real failure to act on.

## P-2: refused (the editor changed nothing)

- Diff: none
- Rationale: Nothing in the brief is actually failing, so I made no edit.

The two graders named as failing, `spec-isolation` and `spec-loop-rules`, each report a mean of 1.00 with a spread of 0.00, which is a full pass, and their evidence blocks read "none". The improvement run before this one (`docs/improve/2026-11-01-3/record.md:33`) lists both cases as never probed, so the 1.00 figures are most likely placeholder values for cases with no measured runs rather than scores from a real trace. There is no failing grader, no trace, and no CTO plan to reason from, so any change to a page under `plugins/core/skills/crew/` or `plugins/core/agents/` would be a guess with no evidence that it fixes anything and a live chance of disturbing a pinned sentence that the skill tests check. The smallest change that makes these graders pass for the right reason is no change at all. If these two cases are meant to be exercised, the next step is to run them so a real trace and real grader results exist to work from.

## Outcome

- Composition: none
- Kept: nothing
- Lessons: none
- Cases no run has measured (never probed): spec-resolve-rules, spec-review-planted
- Cost: 1.79 USD
- Exit status: 0
