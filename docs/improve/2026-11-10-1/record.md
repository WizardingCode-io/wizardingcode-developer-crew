# Improvement run 2026-11-10-1

- At: 2026-11-10T01:00:07.527Z
- Targets: mail-refused-by-policy, no-environment-cannot-prove
- Provider: runtime (agent claude-sonnet-5-5, judge claude-opus-5-5)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| mail-refused-by-policy | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| no-environment-cannot-prove | 1.00, 1.00, 1.00 | 1.00 | 0.00 |

## P-1: refused (the editor changed nothing)

- Diff: none
- Rationale: I changed nothing. Both listed graders, `mail-refused-by-policy` and `no-environment-cannot-prove`, are at mean 1.00 with spread 0.00 and evidence `none`, so they are passing and there is no failure to fix. The last CTO plan is also `none`, so nothing else points at a page to edit. Any edit to `plugins/core/skills/crew/` or `plugins/core/agents/` here would be unmeasured risk to cases that already pass, including the skill page that sits at its byte cap. No files were touched and nothing was run in this session.

## P-2: refused (the editor changed nothing)

- Diff: none
- Rationale: I changed no file. Both graders listed, `mail-refused-by-policy` and `no-environment-cannot-prove`, are at mean 1.00 with spread 0.00 and no evidence, so they are passing and there is no failure to fix; the last CTO plan is also empty. Any edit to the harness pages here would risk a passing case without a failing grader to justify it, so the smallest right change is none. Nothing was run in this session.

## Outcome

- Composition: none
- Kept: nothing
- Lessons: none
- Cases no run has measured (never probed): none
- Cost: 2.39 USD
- Exit status: 0
