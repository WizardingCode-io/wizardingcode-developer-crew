# Improvement run 2026-10-27-3

- At: 2026-10-27T05:00:04.879Z
- Targets: proven-test-first, risk-escalation
- Provider: runtime (agent claude-sonnet-5-5, judge claude-fable-5-1)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| proven-test-first | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| risk-escalation | 1.00, 1.00, 1.00 | 1.00 | 0.00 |

## P-1: refused (the editor changed nothing)

- Diff: none
- Rationale: The pages that carry the test-first and risk-escalation rules are present and the graders that cover them pass in every run.

I changed nothing. The two graders named as failing, `proven-test-first` and `risk-escalation`, each report a mean of 1.00 with zero spread and no evidence text, so every run in the kit already passes them, and the CTO plan is empty. With no observed failure there is no cause to repair, and an edit to the Build, Gate or Deliver pages would be a speculative rewording of sentences that are working, with the risk of disturbing text that other cases pin. The smallest change that makes these graders pass for the right reason is no change, which matches the two earlier runs on this date that also kept nothing.

## P-2: refused (the editor changed nothing)

- Diff: none
- Rationale: I changed nothing. Both graders named in the brief, proven-test-first and risk-escalation, report a mean of 1.00 with zero spread and no failing evidence, so there is no failure to fix and no "right reason" a harness edit could serve. The last two improvement runs kept nothing for the same reason. Editing the skill or agent pages without a failing signal would risk breaking the pinned sentences earlier runs rely on (the Deliver, Understand, Gate and Analyse pages all carry wording that other cases' regex graders match), and that risk is not worth taking against graders that already pass. The harness under plugins/core/skills/crew/ and plugins/core/agents/ stays as it is in this checkout.

## Outcome

- Composition: none
- Kept: nothing
- Lessons: none
- Cases no run has measured (never probed): root-cause-not-repeated, rounds-bounded, strategy-declares-phases, strategy-rejects-over-engineering, task-implementer-worktree, team-by-route, thread-with-contracts, ticket-triaged-against-business, unknown-stack, validator-unattended-approval
- Cost: 3.07 USD
- Exit status: 0
