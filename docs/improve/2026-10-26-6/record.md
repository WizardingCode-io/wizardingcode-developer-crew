# Improvement run 2026-10-26-6

- At: 2026-10-26T11:00:05.110Z
- Targets: gap-restore-schema-not-data, gate-scoped-to-change
- Provider: runtime (agent claude-sonnet-5-5, judge claude-fable-5-1)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| gap-restore-schema-not-data | 0.50, 0.50, 0.50 | 0.50 | 0.00 |
| gate-scoped-to-change | 0.80, 0.60, 0.60 | 0.67 | 0.20 |
| gap-redirect-target | 0.50, 1.00, 1.00 | 0.83 | 0.50 |

## P-1: lose

- Diff: M plugins/core/skills/crew/checklists/migration-or-restore.md, M plugins/core/skills/crew/references/build.md, M plugins/core/skills/crew/references/deliver.md, M plugins/core/skills/crew/references/plan.md, M plugins/core/skills/crew/references/understand.md
- Rationale: No test pins the reworded sentences, and every pinned string (the todo-loop commands, the "never an assumption" clause, the C-16 marker, the 24-line checklist cap) is intact.

I changed five harness pages and nothing else. For `gap-restore-schema-not-data`, the `says-data-gone` grader is a regex over the trace for "rows … cannot be restored" or "re-enter", and the recorded runs asked the right question and waited in their own words ("the data is gone"), because the lead decides at Understand's "What the request points at" bullet while the only page holding the corpus wording, `checklists/migration-or-restore.md`, is read in Conclave after the wait; that bullet in `references/understand.md` now says something dropped on purpose comes back as schema only, to be said in the words "the rows cannot be restored by a migration" with the question "who re-enters them or where a backup is" in the decision's text and the message, and the checklist's C-16 warning carries the same words for a lead that reaches Conclave. For `gate-scoped-to-change`, the `todo-gated` regex wants the engine's `T-n gate round 1: pass` line and the `web-not-run` judge wants the ending to report the todo's own gate on apps/api with apps/web left out, yet every recorded run skipped the todo loop: the agent reached for `crew task open` (refused, needs a worktree) or read "after its commit" as a step the sandbox's git cannot take, and went on to the item's gate run with no todo; `references/plan.md` now says a request asked "as one todo" or "in this checkout" is a todo of the plan on every route, that the note needs no commit since `--scope` names the files, and that a refused `open` is answered with `note`, `references/build.md` says the todo is noted, gated and briefed after its criteria are green and before `crew gate run <id>`, which never stands in for the todo's gate, and `references/deliver.md` item 2 tells the lead to name each todo's gate line, the target its tests ran on and that the sibling ta
- Probe set: gap-redirect-target, gap-restore-schema-not-data, gate-scoped-to-change
- Gain: -0.03

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| gap-redirect-target | 0.50, 1.00, 1.00 | 0.83 | 0.50 |
| gap-restore-schema-not-data | 0.50, 0.50, 1.00 | 0.67 | 0.50 |
| gate-scoped-to-change | 0.80, 0.60, 0.60 | 0.67 | 0.20 |

## P-2: lose

- Diff: M plugins/core/skills/crew/references/analyse.md, M plugins/core/skills/crew/references/build.md, M plugins/core/skills/crew/references/deliver.md, M plugins/core/skills/crew/references/plan.md, M plugins/core/skills/crew/references/understand.md
- Rationale: Nothing pins the rewritten sentences, and every pinned sentence in the five pages is intact. The edits are complete.

I changed five harness pages and nothing else: `plugins/core/skills/crew/references/analyse.md`, `understand.md`, `build.md`, `plan.md` and `deliver.md`. For `gap-restore-schema-not-data`, the `says-data-gone` grader is a regex over the trace for "rows … cannot be restored" or "re-enter", and every recorded plugin run said the data was gone in other words and passed the `honest-ending` judge, because the only page holding C-16's words, `checklists/migration-or-restore.md`, is read in Conclave, after the lead has already asked and ended the turn at Understand; the Analyse page (read on every route for a fix, which is how "disappeared after the last deploy" is typed) now says that an origin that is a removal on record is said as such, that a dropped table took its rows, that a new migration brings the schema back and no data, and that the message says, in the checklist's words, that the rows cannot be restored by a migration and asks who re-enters them or where a backup is, as a recorded decision, with the item waiting; the Understand bullet on what the request points at carries the same sentence for a request typed as a feature. For `gate-scoped-to-change`, `todo-gated` wants the engine's `T-n gate round 1: pass` line and `web-not-run` wants the final message to report the todo's own gate on apps/api and say apps/web was not part of it, and the recorded runs never ran `crew task note`, `gate` or `brief`: the Build page's todo paragraph was conditional ("when a todo is done"), asked for a commit the sandbox's git cannot make, and omitted the `--text` the engine demands where the standard route has no `plan.md`, so the lead went straight to `crew gate run` or reached for `crew task open`. The Build page now says every todo closes with its own gate and brief before the item's gate run, that an inline todo needs no commit or worktree, gives the note comma
- Probe set: gap-redirect-target, gap-restore-schema-not-data, gate-scoped-to-change
- Gain: 0.13

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| gap-redirect-target | 1.00, 1.00, 0.50 | 0.83 | 0.50 |
| gap-restore-schema-not-data | 0.50, 1.00, 1.00 | 0.83 | 0.50 |
| gate-scoped-to-change | 0.60, 0.60, 0.80 | 0.67 | 0.20 |

## Outcome

- Composition: none
- Kept: nothing
- Lessons: K-157, K-158
- Cases no run has measured (never probed): gate-tampering, issue-fast-overhead, issue-root-cause-named, jev-tightens-never-loosens, judgement-gate-not-run, kind-observed-e2e, kind-preserve-not-behavior, mail-question-between-projects, mail-refused-by-policy, no-environment-cannot-prove, pack-agentic-os-absent, pack-agentic-os-seats-the-team, pack-laravel-absent, pack-laravel-refines-the-gates, personalities-differ, priority-lowered-with-reason, proven-test-first, risk-escalation, root-cause-not-repeated, rounds-bounded, strategy-declares-phases, strategy-rejects-over-engineering, task-implementer-worktree, team-by-route, thread-with-contracts, ticket-triaged-against-business, unknown-stack, validator-unattended-approval
- Cost: 18.25 USD
- Exit status: 0
