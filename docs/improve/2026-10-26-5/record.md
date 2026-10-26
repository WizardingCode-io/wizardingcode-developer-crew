# Improvement run 2026-10-26-5

- At: 2026-10-26T10:00:05.963Z
- Targets: gap-erasure-or-deactivation, gap-redirect-target
- Provider: runtime (agent claude-sonnet-5-5, judge claude-fable-5-1)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| gap-erasure-or-deactivation | 0.67, 0.67, 0.67 | 0.67 | 0.00 |
| gap-redirect-target | 1.00, 0.50, 1.00 | 0.83 | 0.50 |

## P-1: lose

- Diff: M plugins/core/skills/crew/references/analyse.md, M plugins/core/skills/crew/references/receive.md, M plugins/core/skills/crew/references/understand.md
- Rationale: I changed three harness pages and nothing else: `plugins/core/skills/crew/references/understand.md`, `plugins/core/skills/crew/references/receive.md` and `plugins/core/skills/crew/references/analyse.md`. For `gap-erasure-or-deactivation`, every run asked and waited (the `waits` and `honest-ending` graders passed) but `asks-which` found no `crew decision … add` naming erasure or deactivation, which fits a lead who asked at Receive's "ask what is missing" step or at Understand in prose, as a `crew question`, or as "soft or hard delete": rule 5 sends a doubt to `crew question`, and the checklist that holds the words "erasure or deactivation" (`checklists/deletion.md`, C-11) is read only in Conclave, after the asking is over. The Understand bullet for decisions and the Receive step now say a word of the request two engineers would build differently is a decision, recorded with `crew decision <id> add` before it is asked and never as a question, in the words the kind's checklist gives it under "Decisions only the user can make", with the example spelled out: a ticket's "delete" is asked as erasure or deactivation, with what each means for the customer's data. For `gap-redirect-target`, the engine's `computeRoute` sends only a `fix` or `chore` in one spot to the fast route, so a run that typed the redirect request as a fix read nothing but the skill page and the Analyse page before building, never the endpoint or link-target checklists, and shipped the redirect to `/slow-down` without saying the page is not served; the skill page sits at its byte ceiling, so the rule now lives in the Analyse page's criteria section, which every fast-route fix reads: a redirect or link target is checked against where the repository lists its routes before the criteria, one the app does not serve is named by its path in the message as not a route the app serves, and the lead waits (`crew await <id> user`) and asks whether to add the page or redirect anyway rather than building it on an assu
- Probe set: gap-erasure-or-deactivation, gap-redirect-target
- Gain: -0.33

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| gap-erasure-or-deactivation | 0.67, 0.67, 0.67 | 0.67 | 0.00 |
| gap-redirect-target | 1.00, 1.00, 1.00 | 1.00 | 0.00 |

## P-2: lose

- Diff: M plugins/core/skills/crew/references/analyse.md, M plugins/core/skills/crew/references/receive.md, M plugins/core/skills/crew/references/understand.md
- Rationale: I changed three harness pages and nothing else: `plugins/core/skills/crew/references/receive.md`, `plugins/core/skills/crew/references/understand.md` and `plugins/core/skills/crew/references/analyse.md`. The `asks-which` grader of `gap-erasure-or-deactivation` is a regex over the trace for a `crew decision … add` whose quoted question names erasure, deactivation or anonymisation, and every recorded run of the plugin arm (SP2c, SP7a, this run's three) asked the right question in prose and waited (`waits` and `honest-ending` pass) without ever recording it. The ticket is vague, so the lead asks at Receive step 3, whose text said "ask … and nothing else" and named no record; the Understand bullet names `crew decision <id> add` but left the words to the lead, who asks as soft or hard delete, while the only page holding "Erasure or deactivation" is the deletion checklist, read in Conclave after the wait. Both pages now say that a choice a checklist lists under "Decisions only the user can make" is a decision, never a question, recorded in the checklist's own words before the message asks it, with the "delete" ticket spelled out: recorded with `crew decision <id> add` as the question "Erasure or deactivation: …", default deactivation, never asked as soft or hard delete (written so the page text itself cannot match the regex). For `gap-redirect-target`, the engine routes a `fix` in one spot to the fast route, where the lead reads only SKILL.md (nine bytes under its cap) and, for a fix, `analyse.md`, so the Understand bullet that says to read the routes list never reaches it and one run in three ships the redirect; the Blast radius line of `analyse.md` now says what the fix points at is named with whether it exists after reading where the repository lists them, and that a target no route serves is a decision for the user on every route: wait, say in the message that the target is not a route the app serves, ask whether to add the page or build the redirect anyway, and build
- Probe set: gap-erasure-or-deactivation, gap-redirect-target
- Gain: -0.33

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| gap-erasure-or-deactivation | 0.67, 0.67, 0.67 | 0.67 | 0.00 |
| gap-redirect-target | 1.00, 1.00, 1.00 | 1.00 | 0.00 |

## Outcome

- Composition: none
- Kept: nothing
- Lessons: K-152, K-153
- Cases no run has measured (never probed): gap-restore-schema-not-data, gate-scoped-to-change, gate-tampering, issue-fast-overhead, issue-root-cause-named, jev-tightens-never-loosens, judgement-gate-not-run, kind-observed-e2e, kind-preserve-not-behavior, mail-question-between-projects, mail-refused-by-policy, no-environment-cannot-prove, pack-agentic-os-absent, pack-agentic-os-seats-the-team, pack-laravel-absent, pack-laravel-refines-the-gates, personalities-differ, priority-lowered-with-reason, proven-test-first, risk-escalation, root-cause-not-repeated, rounds-bounded, strategy-declares-phases, strategy-rejects-over-engineering, task-implementer-worktree, team-by-route, thread-with-contracts, ticket-triaged-against-business, unknown-stack, validator-unattended-approval
- Cost: 10.17 USD
- Exit status: 0
