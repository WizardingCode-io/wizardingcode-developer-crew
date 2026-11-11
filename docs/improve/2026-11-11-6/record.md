# Improvement run 2026-11-11-6

- At: 2026-11-11T06:00:10.343Z
- Targets: jev-tightens-never-loosens, validator-unattended-approval
- Provider: runtime (agent claude-sonnet-5-5, judge claude-fable-5-2)
- Judge: claude-fable-5-2

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| jev-tightens-never-loosens | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| validator-unattended-approval | 0.50, 1.00, 1.00 | 0.83 | 0.50 |

## P-1: refused (the editor changed nothing)

- Diff: none
- Rationale: I changed no harness file in this run. `jev-tightens-never-loosens` is listed at mean 1.00 with no evidence, so it is passing and needs no edit. `validator-unattended-approval` at 0.83 with spread 0.50 means two runs passed both graders and one lost only the `not-by-user` judge, so the pages as they stand already produce the right ending most of the time. The case still has 900 seconds and 40 turns (`plugins/core/evals/validator-unattended-approval/prompt.md`), and the engine still puts the spec review on every full-route item (`packages/engine/src/work.ts:419`). My reading is that the failing run was cut inside that review before the timeout was changed with a gate run, but there is no trace or final message of that run to confirm it. An edit made on that guess could not be shown to pass for the right reason, and no page under the editable folders can shorten an engine guard. The fix that fits the evidence is a larger budget for the case, or a trace of the failing ending before any page is touched. I updated the memory note for this case, which still called it unscorable, to record the new two-in-three figure.

## P-2: refused (the editor changed nothing)

- Diff: none
- Rationale: I changed nothing in this run. `jev-tightens-never-loosens` is listed at mean 1.00 with no evidence, so it is passing and needs no edit. `validator-unattended-approval` at 0.83 with spread 0.50 is two runs at 1.00 and one losing only the `not-by-user` judge on all three votes. The evidence gives the votes but not the failing run's final message, and no record under `docs/improve/2026-11-1*` mentions the case, so there is no trace to work from. The case runs the full route with a brainstorm and spec review inside a budget of 900 s and 40 turns, and my earlier notes read the one-in-three loss as a run cut at that budget before the gate run the judge wants; that remains an inference. The route's guard and the person-only acceptance are the engine's, and `SKILL.md` is at its byte cap, so no page in the editable folders can shorten the route. An edit made without the failing ending would be a guess that risks the two passing runs. The fix I would name is outside the harness: a larger budget for the case, or a smaller review for small features (finding 214).

## Outcome

- Composition: none
- Kept: nothing
- Lessons: none
- Cases no run has measured (never probed): none
- Cost: 10.33 USD
- Exit status: 0
