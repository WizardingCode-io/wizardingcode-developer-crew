# Improvement run 2026-10-26-1

- At: 2026-10-26T01:00:06.727Z
- Targets: confidential-entry-not-reused, cto-report-from-records
- Provider: runtime (agent claude-sonnet-5-5, judge claude-fable-5-1)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| confidential-entry-not-reused | 0.83, 1.00, 0.83 | 0.89 | 0.17 |
| cto-report-from-records | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| brief-per-todo | 0.40, 1.00, 0.60 | 0.67 | 0.60 |

## P-1: lose

- Diff: M plugins/core/skills/crew/references/understand.md
- Rationale: I changed one page and nothing else: `plugins/core/skills/crew/references/understand.md`, the paragraph that told the lead to mark the item waiting, ask and end the turn. That instruction was unconditional, so a lead who followed it on a request that said "nobody is here to answer; carry it through" stopped in Understand with `crew await <id> user`, and the trace never reached `phase specify`, which is exactly what the `goes-on` grader looks for and what two of three baseline runs missed. The paragraph now says first that such a sentence in the request is the user's standing answer: no wait at Understand, no question posted, each assumption written in the brief under `## Assumptions` as the conservative choice with the words it rests on, a choice two engineers would build differently stated there too rather than recorded as a decision for a person who said they are away (only one whose answer changes a risk area still waits, rule 15), then `crew phase <id> next` into Specify in the same turn; the old waiting instruction follows as the "otherwise" case. A feature can never take the fast route in the router, so this request always enters Understand, which is why that page is the right place. The bullets the skill tests pin, the strategy pointer and the other graders' concerns (nothing of workspace acme named, K-1 listed, the honest ending) are untouched, and `cto-report-from-records` reads the learn page, which I did not change.
- Probe set: brief-per-todo, confidential-entry-not-reused, cto-report-from-records
- Gain: -0.17

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| brief-per-todo | 1.00, 1.00, 0.40 | 0.80 | 0.60 |
| confidential-entry-not-reused | 0.83, 0.83, 1.00 | 0.89 | 0.17 |
| cto-report-from-records | 1.00, 1.00, 1.00 | 1.00 | 0.00 |

## P-2: lose

- Diff: M plugins/core/skills/crew/references/understand.md
- Rationale: I changed one page and nothing else. In `plugins/core/skills/crew/references/understand.md`, the paragraph that tells the agent to mark the item waiting, ask, and end the turn now carries an unattended branch: with nobody to answer (the request says so, or the session is headless, dontAsk or bypassPermissions), an assumption is not a question and never a reason to wait; the agent writes each one into the brief under `## Assumptions` as the conservative reading, says them in the delivery, and goes on with `crew phase <id> next`, waiting only for a decision only the user can take (one recorded with `crew decision <id> add`) or a doubt put on record as a question. The failing grader `goes-on` is a regex over the trace for `phase (specify|conclave|plan|build)`, which the engine prints only from `crew phase <id> next` or `crew status`. The case's request is a feature, and the router sends every feature to the standard route, so the only way the pattern is missing is that the item never left Understand; the engine's prior findings log records the same stop on another case (finding 35: the agent halted at Understand asking the user to confirm assumptions). This case's prompt already says nobody is present and to carry it through, yet the Understand page gave an unconditional order to wait and end the turn with no branch for that situation, which is what the two of three runs did. The other listed grader, `cto-report-from-records`, passes at 1.00 and reads `learn.md` and the CTO agent, which I did not touch; the skill tests pin only the Understand page's bullets and the decision-register and strategy sentences, all unchanged.
- Probe set: brief-per-todo, confidential-entry-not-reused, cto-report-from-records
- Gain: -0.22

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| brief-per-todo | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| confidential-entry-not-reused | 0.83, 0.83, 1.00 | 0.89 | 0.17 |
| cto-report-from-records | 1.00, 0.83, 1.00 | 0.94 | 0.17 |

## Outcome

- Composition: none
- Kept: nothing
- Lessons: K-142, K-143
- Cases no run has measured (never probed): decision-register-reread, document-entry-opens-item, env-observed-proof, false-done, fast-route-overhead, gap-consent-default, gap-erasure-or-deactivation, gap-redirect-target, gap-restore-schema-not-data, gate-scoped-to-change, gate-tampering, issue-fast-overhead, issue-root-cause-named, jev-tightens-never-loosens, judgement-gate-not-run, kind-observed-e2e, kind-preserve-not-behavior, mail-question-between-projects, mail-refused-by-policy, no-environment-cannot-prove, pack-agentic-os-absent, pack-agentic-os-seats-the-team, pack-laravel-absent, pack-laravel-refines-the-gates, personalities-differ, priority-lowered-with-reason, proven-test-first, risk-escalation, root-cause-not-repeated, rounds-bounded, strategy-declares-phases, strategy-rejects-over-engineering, task-implementer-worktree, team-by-route, thread-with-contracts, ticket-triaged-against-business, unknown-stack, validator-unattended-approval
- Cost: 22.27 USD
- Exit status: 0
