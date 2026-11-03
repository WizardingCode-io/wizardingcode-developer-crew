# Improvement run 2026-11-03-1

- At: 2026-11-03T00:00:02.422Z
- Targets: mail-refused-by-policy, no-environment-cannot-prove
- Provider: runtime (agent claude-sonnet-5-5, judge claude-opus-5-5)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| mail-refused-by-policy | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| no-environment-cannot-prove | 1.00, 1.00, 1.00 | 1.00 | 0.00 |

## P-1: refused (the editor changed nothing)

- Diff: none
- Rationale: I changed nothing. Both graders named as failing, `mail-refused-by-policy` and `no-environment-cannot-prove`, are reported at a mean of 1.00 with a spread of 0.00 and no failing evidence, which is a full pass on every run, not a failure. The two eval cases exist under `plugins/core/evals/` and carry only a name, tags and a fixture script, so there is no grader output pointing at any page the lead reads. The last CTO plan is empty too. The smallest change that keeps these graders passing for the right reason is no change at all, since any edit to the skill page or a reference page would be a change without a cause to attribute it to and would risk moving other cases that are not named here. No files under `plugins/core/skills/crew/` or `plugins/core/agents/` were touched, and the worktree remains clean.

## P-2: refused (the editor changed nothing)

- Diff: none
- Rationale: I changed nothing. Both graders named in the task, `mail-refused-by-policy` and `no-environment-cannot-prove`, report a mean of 1.00 with a spread of 0.00 and carry no evidence of a failing vote. The one earlier run that targeted this same pair, recorded on 2026-10-26, measured them at 1.00 on every run before and after an edit, and kept nothing. There is no failing grader here, so no edit to a page under `plugins/core/skills/crew/` or `plugins/core/agents/` could make anything pass for the right reason, and the only possible effect of a change would be a regression on the fragile cases the harness lessons describe. The smallest change that keeps these two graders passing is no change at all.

## Outcome

- Composition: none
- Kept: nothing
- Lessons: none
- Cases no run has measured (never probed): none
- Cost: 3.36 USD
- Exit status: 0
