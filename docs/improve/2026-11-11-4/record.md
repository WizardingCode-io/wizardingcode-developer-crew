# Improvement run 2026-11-11-4

- At: 2026-11-11T04:00:10.001Z
- Targets: pack-frontend-absent, team-by-route
- Provider: runtime (agent claude-sonnet-5-5, judge claude-fable-5-2)
- Judge: claude-fable-5-2

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| pack-frontend-absent | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| team-by-route | 0.83, 0.67, 0.67 | 0.72 | 0.17 |

## P-1: refused (the editor changed nothing)

- Diff: none
- Rationale: I changed no file under `plugins/core/skills/crew/` or `plugins/core/agents/`: the evidence doesn't single out a harness cause for `team-by-route`, and nothing was run in this session (no shell). `pack-frontend-absent` is at mean 1.00 with evidence `none`, so it is passing. For `team-by-route`, the two listed failures are `validations-recorded` (it wants `lead-qa: validated` and then `lead-security: validated` in the trace) and `validators-exist` (`src/validation.mjs` was never written). The team-line graders and `honest-ending` are not listed, so the lead seated the team and ended with an honest message. My inference, with no trace to confirm it, is that the item stopped before Plan rather than being cut by the budget. The most likely cause is a lead returning the spec until the two-round validation cap, where the continuation is the user's and nobody is present; a decision opened for the request's stated "Decisions:" is the other candidate. The case scored 1.00 ×3 on 2026-11-04, and the 2026-10-27-6 edits made from inferred causes on this same case were dropped as lose and inconclusive, so another untraced edit would be a guess. The next step is a trace of a failing run: look for `validation of spec by lead-…: returned` and the `validation round 3 … the policy allows 2` refusal. If the leads are returning a two-function refactor's spec, the lever is `plugins/core/agents/tech-lead.md` or the standard-route spec template, not the skill page. I saved this analysis to memory for the next run.

## P-2: refused (the editor changed nothing)

- Diff: none
- Rationale: I changed nothing in this run. `pack-frontend-absent` is listed at mean 1.00 with no evidence, so it is passing and needs no edit. For `team-by-route`, the evidence is the same as in the earlier run today: `validations-recorded` did not match and `src/validation.mjs` was never written, while the team lines and the honest ending are not listed as failing. That fits an item that stopped before Plan, most likely on a lead's `returned` at the validation-round cap or on a decision opened with nobody present, but that is inferred. There is still no trace of the failing runs in `docs/improve/`; the only recent record naming the case lists it in an unprobed set. The case scored 1.00 three times on 2026-11-04 with the leads'-validation text reading as it does now, and the 2026-10-27-6 edits made from inferred causes were dropped as lose or inconclusive. With nothing on the pages singled out, another guessed edit would not be a fix for the right reason. The next step is a trace of a failing run, checked first for `validation of spec by lead-…: returned` and `validation round 3 of …: the policy allows 2`.

## Outcome

- Composition: none
- Kept: nothing
- Lessons: none
- Cases no run has measured (never probed): none
- Cost: 10.34 USD
- Exit status: 0
