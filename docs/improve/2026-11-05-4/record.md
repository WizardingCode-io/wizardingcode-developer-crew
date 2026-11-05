# Improvement run 2026-11-05-4

- At: 2026-11-05T04:00:07.132Z
- Targets: ticket-triaged-against-business, pack-next-absent
- Provider: runtime (agent claude-sonnet-5-5, judge claude-opus-5-5)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| ticket-triaged-against-business | 0.67, 0.67, 0.67 | 0.67 | 0.00 |
| pack-next-absent | 1.00, 1.00, 1.00 | 1.00 | 0.00 |

## P-1: refused (the editor changed nothing)

- Diff: none
- Rationale: I changed no harness file. `pack-next-absent` is listed at mean 1.00, spread 0.00 with evidence `none`, so it already passes and there is nothing to edit for it. `ticket-triaged-against-business` scores 0.67 with spread 0.00 because its `source-recorded` and `honest-ending` graders pass in every run while `lowered` never fires, and the reason sits in the grader, not the harness: `plugins/core/evals/ticket-triaged-against-business/graders/lowered.md` line 4 pins the SP3 wording `priority normal (proposed high, against the signed business priorities): <reason>`, which `crew start` printed on 2026-10-19, whereas the engine since SP7 prints `priority normal (proposed high, confirmed normal against the signed business priorities: <reason>)` (`triageSummary` in `packages/engine/src/priorities.ts` line 153, pinned by cli.test.ts SP3-T3 AC-3 at lines 4967 and 6072). The lead does lower the priority and records the reason, so the run already does the right thing; the only way to make that regex match from the harness would be to plant the stale sentence in a reference page or the lead's prose, which would fire the trace grader on words rather than on what ran. The fix is the grader's pattern (drop the comma-and-colon form in favour of the engine's `confirmed normal against the signed business priorities:` form), which is outside the folders this run may edit, so I left the tree untouched and only reconfirmed the standing memory note about this case.

## P-2: refused (the editor changed nothing)

- Diff: none
- Rationale: I changed no file. Both graders in this run give no harness something to fix. `pack-next-absent` is listed at mean 1.00, spread 0.00 with evidence `none`, so it already passes for the right reason and any edit for it would be a change without failing evidence behind it. The `lowered` grader of `ticket-triaged-against-business` is a trace regex at `plugins/core/evals/ticket-triaged-against-business/graders/lowered.md:4` that wants the SP3 form `priority normal (proposed high, against the signed business priorities): <reason>`, while the engine has printed `proposed high, confirmed normal against the signed business priorities: <reason>` since SP7, at `packages/engine/src/priorities.ts:153`, a wording pinned by the CLI test. The case's other graders, `source-recorded` and `honest-ending`, pass at spread 0.00, so the lead does lower the priority against the signed business priorities and only the stale pattern misses. The only way a harness edit could fire that regex would be to plant the old wording in a reference page or in the lead's prose, which the eval README rules out: trace regexes anchor on what ran, never on a reference's or the agent's words. The fix is the grader's pattern, which is outside the folders this loop may edit, so the right move is to record that and leave the harness as it is.

## Outcome

- Composition: none
- Kept: nothing
- Lessons: none
- Cases no run has measured (never probed): none
- Cost: 3.82 USD
- Exit status: 0
