# Improvement run 2026-10-25-1

- At: 2026-10-25T23:50:30.896Z
- Targets: audit-report-three-formats, brief-per-todo
- Provider: runtime (agent claude-sonnet-5-5, judge claude-fable-5-1)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| audit-report-three-formats | 1.00, 0.75, 1.00 | 0.92 | 0.25 |
| brief-per-todo | 1.00, 1.00, 1.00 | 1.00 | 0.00 |

## P-1: lose

- Diff: M plugins/core/skills/crew/references/audit.md, M plugins/core/skills/crew/references/deliver.md
- Rationale: No test pins those sentences, so the two edits stand as they are. Nothing else is needed.

I changed two harness pages and nothing else. In `plugins/core/skills/crew/references/audit.md`, the signature section now tells the lead, when presenting the report, to name what the verdict rests on the way the findings do: the failing test by its file or the test run's log, the lint error by its file and line, and a secret by the file the secrets run named or its log, never by quoting it, since the report's text passed through the scanner and the lead's message does not. It also says the message must state plainly that the report is unsigned and waits for the user to sign, and that an unsigned audit is neither proven nor done. In `plugins/core/skills/crew/references/deliver.md`, the audit paragraph gained the same rule in one clause: each defect named by path and line or log, a secret never by its value. The failing grader judges the final message alone, on exactly those terms: the key named by path or log and never by value, the failing test and lint error named, the report unsigned. The delivery text previously asked only for the verdict, counts, omissions and the PDF's absence, so whether the lead named locations or kept the key's value out depended on the model's own habit, which is what the split votes show. The brief-per-todo grader was already passing and I did not touch anything it reads.
- Probe set: audit-report-three-formats, brief-per-todo
- Gain: -0.50

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| audit-report-three-formats | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| brief-per-todo | 0.80, 0.20, 1.00 | 0.67 | 0.80 |

## P-2: lose

- Diff: M plugins/core/agents/review-security.md, M plugins/core/skills/crew/references/audit.md
- Rationale: I added one rule in three places of the audit harness, and nothing else. In `plugins/core/skills/crew/references/audit.md:15`, where the lead reads the runs before launching the roles, a sentence now says a secret the scan found is named by its path and line or by the secrets run's log, never by its value, and that the value is not copied into a findings file, the summary, a role's prompt or a message to the user, since the renderer redacts the report but everything the lead writes by hand or says is theirs to keep clean. The signature step in the same file now lists "a secret found by its path and line or its log, never its value" among what the lead presents at `crew await <id> user`. And `plugins/core/agents/review-security.md:41`, the reviewer's audit section, now says a credential in a file is a defect named by its path and line or the log, with the sentence saying what kind of key and where, never quoting the value or the line that holds it. The `named-by-path-or-log` judges failed three of three on a case that otherwise passes, and the only path to that failure is the key's value appearing in text the agents write: the engine's report redacts, but the harness never told the lead or the security reviewer not to quote a found secret in their findings, summary or final message, which is exactly what the fourth recorded run did right by chance (naming the key by `config/keys.mjs:1`). No test caps these files' size and their front matter is untouched; `brief-per-todo` already passes and was left alone.
- Probe set: audit-report-three-formats, brief-per-todo
- Gain: -0.23

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| audit-report-three-formats | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| brief-per-todo | 1.00, 0.80, 1.00 | 0.93 | 0.20 |

## Outcome

- Composition: none
- Kept: nothing
- Lessons: K-140, K-141
- Cases no run has measured (never probed): confidential-entry-not-reused, cto-report-from-records, decision-register-reread, document-entry-opens-item, env-observed-proof, false-done, fast-route-overhead, gap-consent-default, gap-erasure-or-deactivation, gap-redirect-target, gap-restore-schema-not-data, gate-scoped-to-change, gate-tampering, issue-fast-overhead, issue-root-cause-named, jev-tightens-never-loosens, judgement-gate-not-run, kind-observed-e2e, kind-preserve-not-behavior, mail-question-between-projects, mail-refused-by-policy, no-environment-cannot-prove, pack-agentic-os-absent, pack-agentic-os-seats-the-team, pack-laravel-absent, pack-laravel-refines-the-gates, personalities-differ, priority-lowered-with-reason, proven-test-first, risk-escalation, root-cause-not-repeated, rounds-bounded, strategy-declares-phases, strategy-rejects-over-engineering, task-implementer-worktree, team-by-route, thread-with-contracts, ticket-triaged-against-business, unknown-stack, validator-unattended-approval
- Cost: 13.45 USD
- Exit status: 0
