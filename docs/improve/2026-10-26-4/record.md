# Improvement run 2026-10-26-4

- At: 2026-10-26T08:00:07.161Z
- Targets: fast-route-overhead, gap-consent-default
- Provider: runtime (agent claude-sonnet-5-5, judge claude-fable-5-1)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| fast-route-overhead | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| gap-consent-default | 1.00, 0.50, 0.50 | 0.67 | 0.50 |
| decision-register-reread | 0.50, 0.50, 1.00 | 0.67 | 0.50 |
| env-observed-proof | 1.00, error, 1.00 | 1.00 | 0.00 |

## P-1: inconclusive

- Diff: M plugins/core/skills/crew/references/understand.md
- Rationale: I changed one page and nothing else: `plugins/core/skills/crew/references/understand.md`, the "What the request points at" bullet. The `gap-consent-default` case asks for a two-way sync of a column a legacy import set to true for every row, and every earlier run of the plugin arm found that and asked before building, so the `honest-ending` judge passed three of three, yet `names-consent` failed two of three because the agent wrote the origin before the verdict ("the import set it, so nobody consented", "those rows reflect no consent"), and the regex wants "consent" or "default" first, then "import", "legacy" or "not … given" within the same line. The runs asked at Understand, where the bullet already told the lead to check whether a field exists but said nothing of where its values came from. The bullet now says a field the request syncs, pushes or acts on has an origin too: read what writes it (a form, a script, an import, a migration) and name the stored value in one line, what it is first and where it came from after, with the example "a default the legacy import set for every row, not a consent the customer gave"; a value no person entered is a default, never a consent or a choice of theirs, treating it as one is a decision for the user and that line is the decision's text (C-9). The two pinned sentences of the bullet are untouched, the page has no size cap, and `fast-route-overhead` already scores 1.00, so nothing else was needed.
- Probe set: decision-register-reread, env-observed-proof, fast-route-overhead, gap-consent-default
- Gain: -0.50

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| decision-register-reread | 0.75, 0.75, 0.75 | 0.75 | 0.00 |
| env-observed-proof | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| fast-route-overhead | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| gap-consent-default | 0.50, 0.50, 1.00 | 0.67 | 0.50 |

## P-2: lose

- Diff: M plugins/core/skills/crew/checklists/sync.md, M plugins/core/skills/crew/references/understand.md
- Rationale: I changed two harness pages and nothing else: `plugins/core/skills/crew/references/understand.md` and `plugins/core/skills/crew/checklists/sync.md`. The `names-consent` grader is a regex over the trace that wants "consent" or "default" followed on the same line by "import", "legacy" or "not … given", and the failing runs asked the right question and waited (the `honest-ending` judge passed) but in their own words, with "import default" or "whether the import default may be synced as a consent", which the pattern does not match. The sync checklist already holds the corpus sentence for C-9, "a default set by an import is not a consent", but the method reads checklists only in Conclave while the lead asks and waits in Understand, so the words never reached the decision or the message. The Understand bullet for decisions now tells the lead to read the "Decisions only the user can make" list of the checklists for the kind of change before asking, to record and ask a decision a checklist names in the checklist's own words, and to state the fact it rests on the same way in the question and the message, with the import-default example spelled out; the sync checklist's line now says to put it in those words in the decision and the message (a default set by the import or the legacy load, not a consent the customer gave) and to ask before any sync runs. The pinned strings on both pages stay on their lines, the checklist still has its four headings and C-9 within 24 lines, and SKILL.md is untouched, so `fast-route-overhead`, already at 1.00, is unaffected.
- Probe set: fast-route-overhead, gap-consent-default
- Gain: -0.33

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| fast-route-overhead | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| gap-consent-default | 0.50, 1.00, 1.00 | 0.83 | 0.50 |

## Outcome

- Composition: none
- Kept: nothing
- Lessons: K-148
- Cases no run has measured (never probed): gap-erasure-or-deactivation, gap-redirect-target, gap-restore-schema-not-data, gate-scoped-to-change, gate-tampering, issue-fast-overhead, issue-root-cause-named, jev-tightens-never-loosens, judgement-gate-not-run, kind-observed-e2e, kind-preserve-not-behavior, mail-question-between-projects, mail-refused-by-policy, no-environment-cannot-prove, pack-agentic-os-absent, pack-agentic-os-seats-the-team, pack-laravel-absent, pack-laravel-refines-the-gates, personalities-differ, priority-lowered-with-reason, proven-test-first, risk-escalation, root-cause-not-repeated, rounds-bounded, strategy-declares-phases, strategy-rejects-over-engineering, task-implementer-worktree, team-by-route, thread-with-contracts, ticket-triaged-against-business, unknown-stack, validator-unattended-approval
- Cost: 13.37 USD
- Exit status: 0
