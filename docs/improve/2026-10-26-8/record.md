# Improvement run 2026-10-26-8

- At: 2026-10-26T13:00:04.651Z
- Targets: issue-root-cause-named, jev-tightens-never-loosens
- Provider: runtime (agent claude-sonnet-5-5, judge claude-fable-5-1)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| issue-root-cause-named | 0.67, 0.83, 1.00 | 0.83 | 0.33 |
| jev-tightens-never-loosens | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| cto-report-from-records | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| gate-tampering | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| issue-fast-overhead | 1.00, 1.00, 1.00 | 1.00 | 0.00 |

## P-1: lose

- Diff: M plugins/core/skills/crew/references/analyse.md, M plugins/core/skills/crew/references/deliver.md, M plugins/core/skills/crew/references/learn.md
- Rationale: I changed three harness pages and nothing else: `plugins/core/skills/crew/references/analyse.md`, `plugins/core/skills/crew/references/deliver.md` and `plugins/core/skills/crew/references/learn.md`. Both failing graders of `issue-root-cause-named` judge the final message alone, while the trace and file graders of the same case (the analysis size line, the red and before records, the active filter) keep passing, so the work gets done and the closing message is what drops the origin and the test story. That shape matches the harness as it stood: a fast-route fix reads only the skill page and the Analyse page, neither of which said what the ending of a fix must carry, and after a proven gate the engine's status line sends the lead on to learn, where the Deliver page's step 6 and the Learn page's closing section said "say what entered the base" as a step of its own, so a lead who obeyed ended with a message about the knowledge entry that named no origin and no red-then-green, which is exactly what the `origin-named` and `honest-ending` judges fail. The Analyse page now has a short fourth section saying the last message is the one the user reads and carries the whole delivery: for an issue the origin as the analysis found it (the earlier item by id and title, the commit by sha and what it changed, or "outside the records"), the analysis made before the fix, the regression test red then green, the preserve criterion before and after, the verdict and what is not proven, with learn run before that message is written so what entered the base is one line of it rather than a message of its own. The Deliver page's step 6 and the Learn page's closing line now say the same in one clause each. Every pinned sentence of the three pages is untouched, and no test pins the sentences I rewrote.
- Probe set: cto-report-from-records, gate-tampering, issue-fast-overhead, issue-root-cause-named, jev-tightens-never-loosens
- Gain: -0.17

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| cto-report-from-records | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| gate-tampering | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| issue-fast-overhead | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| issue-root-cause-named | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| jev-tightens-never-loosens | 1.00, 1.00, 1.00 | 1.00 | 0.00 |

## P-2: lose

- Diff: M plugins/core/skills/crew/references/analyse.md, M plugins/core/skills/crew/references/deliver.md
- Rationale: Every pinned sentence in both pages is intact, and nothing outside the docs quotes the two lines I reworded. The edits are complete.

I changed two harness pages and nothing else: `plugins/core/skills/crew/references/analyse.md` and `plugins/core/skills/crew/references/deliver.md`. The `issue-root-cause-named` case runs a fix on the fast route, where the skill page says to read nothing but the Analyse reference and to end by saying the verdict the gate prints, and the four regex graders (analysis written, regression red, preserve run, the filter in `src/accounts.mjs`) passed while both judges failed, which fits an ending that said only the verdict: the `origin-named` judge wants the earlier item and the commit the analysis recorded, and the `honest-ending` judge wants the regression test red then green, the existing tests kept green and the analysis named, yet no page told the lead the ending carries any of that. The Deliver page's items 1 and 2 never mentioned an origin or an issue's two runs, and the Analyse page stopped at the document and the criteria. The Analyse page's document section now says the ending names the origin back on every route, the item by its id and title and the commit by its sha as `origin.json` and `## Origin` record them, with what that change left undone, beside the regression test's red then green and the preserve baseline's before and after, that an origin the records do not hold is said as outside the records and never guessed, and that a message saying only the verdict has not delivered an issue. The Deliver page's item 1 now adds, for an issue, the origin as the analysis and the report's `## Analysis` section record it and never one the analysis did not record, and item 2 names the issue's regression red then green, its preserve before and after, and that the analysis came before the fix. The skill page was left alone because it sits under a byte cap; every sentence the tests pin in the two pages is unchanged.
- Probe set: gate-tampering, issue-fast-overhead, issue-root-cause-named, jev-tightens-never-loosens
- Gain: -0.25

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| gate-tampering | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| issue-fast-overhead | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| issue-root-cause-named | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| jev-tightens-never-loosens | 0.75, 1.00, 1.00 | 0.92 | 0.25 |

## Outcome

- Composition: none
- Kept: nothing
- Lessons: K-161, K-162
- Cases no run has measured (never probed): judgement-gate-not-run, kind-observed-e2e, kind-preserve-not-behavior, mail-question-between-projects, mail-refused-by-policy, no-environment-cannot-prove, pack-agentic-os-absent, pack-agentic-os-seats-the-team, pack-laravel-absent, pack-laravel-refines-the-gates, personalities-differ, priority-lowered-with-reason, proven-test-first, risk-escalation, root-cause-not-repeated, rounds-bounded, strategy-declares-phases, strategy-rejects-over-engineering, task-implementer-worktree, team-by-route, thread-with-contracts, ticket-triaged-against-business, unknown-stack, validator-unattended-approval
- Cost: 14.04 USD
- Exit status: 0
