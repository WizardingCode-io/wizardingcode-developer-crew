# Improvement run 2026-11-06-2

- At: 2026-11-06T16:00:07.198Z
- Targets: ui-audit-not-captured, ui-captures-by-fixture
- Provider: runtime (agent claude-sonnet-5-5, judge claude-opus-5-5)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| ui-audit-not-captured | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| ui-captures-by-fixture | 1.00, 1.00, 1.00 | 1.00 | 0.00 |

## P-1: refused (the editor changed nothing)

- Diff: none
- Rationale: Both graders in this run, `ui-audit-not-captured` and `ui-captures-by-fixture`, are listed at mean 1.00 with spread 0.00 and evidence `none`. They are passing in every recorded run, so there is nothing failing to fix and no evidence that would point an edit at the right cause. The last CTO plan is empty as well, and none of the harness lessons name either case, so I have no trace or reason to act on.

I changed no file. Both graders named for this run are passing at a perfect mean with no spread and no evidence of a failing run, so any edit to `plugins/core/skills/crew/` or `plugins/core/agents/` would be a change made without a failing grader to justify it and could only risk the regexes, pinned sentences and byte cap that the skill tests and other cases depend on. The right move for a run whose graders already pass is to leave the harness exactly as it is.

## P-2: refused (the editor changed nothing)

- Diff: none
- Rationale: Both listed graders, `ui-audit-not-captured` and `ui-captures-by-fixture`, sit at mean 1.00 with spread 0.00 and no evidence, so neither is failing and there is nothing to make pass. The last CTO plan is empty and no harness lesson names either case. Following the standing rule for this situation, I edited nothing.

I changed no file. Both graders in the brief are passing in every recorded run, with no failing trace, no CTO plan and no lesson pointing at a page that misleads a lead, so any edit to `plugins/core/skills/crew/` or `plugins/core/agents/` would be a guess with no failure to correct and a risk of moving a page other cases depend on, which the improve record's own rule forbids for graders listed at a perfect score.

## Outcome

- Composition: none
- Kept: nothing
- Lessons: none
- Cases no run has measured (never probed): none
- Cost: 8.23 USD
- Exit status: 0
