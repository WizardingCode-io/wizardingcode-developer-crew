# Improvement run 2026-10-28-1

- At: 2026-10-28T00:00:02.187Z
- Targets: thread-with-contracts, ticket-triaged-against-business
- Provider: runtime (agent claude-sonnet-5-5, judge claude-fable-5-1)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| thread-with-contracts | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| ticket-triaged-against-business | 0.67, 0.67, 0.67 | 0.67 | 0.00 |

## P-1: refused (the editor changed nothing)

- Diff: none
- Rationale: I changed no harness page, because no edit under `plugins/core/skills/crew/` or `plugins/core/agents/` can make the `lowered` grader of `ticket-triaged-against-business` pass for the right reason: the grader's regex wants the engine's triage line in the words `priority normal (proposed high, against the signed business priorities): <reason>`, which is what `crew start` printed when the case was written on 2026-10-19 (the SP3 results record it firing on exactly that line), but since the SP7 triage work the engine prints `priority normal (proposed high, confirmed normal against the signed business priorities: <reason>)` through `triageSummary` in `packages/engine/src/priorities.ts`, pinned by the SP3-T3 AC-3 row of `cli.test.ts`, and neither the report's `- Triage:` line, the status line nor the register entry carries the old shape either. The case's steady 0.67 with zero spread is `source-recorded` and `honest-ending` passing every run, so the lead already opens the ticket with its ClickUp source and lowers the urgency to normal with the release-freeze reason; only the stale pattern misses, and the one way to fire it from my scope (planting the old wording in the Receive page or telling the lead to say it in prose) would pass by a reference read or the agent's own words, which the eval README rules out as an anchor for a trace regex. The fix belongs in `plugins/core/evals/ticket-triaged-against-business/graders/lowered.md` (its pattern brought to the engine's current line), which is an eval file I must not edit; `thread-with-contracts` is at 1.00 and needed nothing.

## P-2: refused (the editor changed nothing)

- Diff: none
- Rationale: I made no change to the harness. The `lowered` grader of `ticket-triaged-against-business` is a trace regex that wants the engine's SP3 triage line, `priority normal (proposed high, against the signed business priorities): <reason>`, and since SP7 §10.2 the engine prints `priority normal (proposed high, confirmed normal against the signed business priorities: <reason>)` from `triageText` and `triageSummary` in `packages/engine/src/priorities.ts`, a wording pinned by two rows of `cli.test.ts`, so the pattern's `, against` can never match what `crew start` runs. The case's other two graders pass with spread 0, which shows the lead already records the ClickUp source and lowers the urgency to normal with the freeze as its reason, so there is no harness defect to fix; the only edit that would fire the regex is planting the old sentence in a reference page or the lead's prose, which the evals README rules out because trace regexes anchor on what ran and never on an agent's or a reference's words. The fix is the grader's pattern, which lies outside the folders I may edit, and `thread-with-contracts` sits at 1.00 and needs nothing.

## Outcome

- Composition: none
- Kept: nothing
- Lessons: none
- Cases no run has measured (never probed): unknown-stack, validator-unattended-approval
- Cost: 8.93 USD
- Exit status: 0
