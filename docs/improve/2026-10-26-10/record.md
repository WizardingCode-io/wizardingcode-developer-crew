# Improvement run 2026-10-26-10

- At: 2026-10-26T16:00:06.735Z
- Targets: kind-preserve-not-behavior, mail-question-between-projects
- Provider: runtime (agent claude-sonnet-5-5, judge claude-fable-5-1)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| kind-preserve-not-behavior | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| mail-question-between-projects | 0.50, 0.50, 0.50 | 0.50 | 0.00 |
| decision-register-reread | 0.75, 0.75, 1.00 | 0.83 | 0.25 |
| env-observed-proof | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| gap-erasure-or-deactivation | 0.67, 0.67, 0.67 | 0.67 | 0.00 |
| gap-redirect-target | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| gate-scoped-to-change | 0.60, 0.60, 0.60 | 0.60 | 0.00 |
| jev-tightens-never-loosens | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| judgement-gate-not-run | 1.00, 0.50, 1.00 | 0.83 | 0.50 |

## P-1: lose

- Diff: M plugins/core/skills/crew/references/deliver.md, M plugins/core/skills/crew/references/mail.md, M plugins/core/skills/crew/references/receive.md, M plugins/core/skills/crew/references/understand.md
- Rationale: I changed four harness pages and nothing else: `plugins/core/skills/crew/references/receive.md`, `understand.md`, `mail.md` and `deliver.md`. The `asked-b` grader is a regex over the trace for the engine's `sent M-… to b (workspace w)` line, which only `crew mail send --to b` prints, and the case scored 0.50 with `answered` and `b-unchanged` passing, which fits a lead that found `loyalty_tier` and its values by reading `peer/b/src/customers.mjs` from the storefront's checkout (or asked the absent user) and never sent mail; the harness as it stood made that the natural move, since Receive step 3 said to ask the user what is missing, the Understand bullet for what the request points at said to read where the repository lists the field, and the only page saying a question goes to another project by mail was `references/mail.md`, which the skill table presents as the page for mail that arrives. Receive step 3 and the Understand bullet now say a fact another project of the workspace holds (the field its endpoint takes, the values it allows) is that project's to answer, sent from the item with `crew mail send --to <project> --type question` then `crew await <id> mail <message id>`, never read from its checkout opened from here, never guessed and never put to a user who said they are away; the Mail page's Sending section carries the same rule with what the engine prints and does (the sent line, the read-only session it opens), tells a lead with nobody present to read `crew mail inbox` again until the reply lands or the opened session's bound passes, since no next turn exists for the Stop hook to hold, and to say a missing reply as not proven rather than guess; and Deliver's item 3 now says the ending names the message id, the project it went to, its answer in its words and that the change rests on it, which is what the `honest-ending` judge reads for. Every pinned sentence of the four pages is intact and `SKILL.md` is untouched, so its byte cap is unaffected.
- Probe set: decision-register-reread, env-observed-proof, gap-erasure-or-deactivation, gap-redirect-target, gate-scoped-to-change, jev-tightens-never-loosens, judgement-gate-not-run, kind-preserve-not-behavior, mail-question-between-projects
- Gain: 0.08

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| decision-register-reread | 0.75, 1.00, 0.75 | 0.83 | 0.25 |
| env-observed-proof | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| gap-erasure-or-deactivation | 0.67, 0.67, 0.67 | 0.67 | 0.00 |
| gap-redirect-target | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| gate-scoped-to-change | 0.60, 0.80, 0.80 | 0.73 | 0.20 |
| jev-tightens-never-loosens | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| judgement-gate-not-run | 1.00, 0.50, 1.00 | 0.83 | 0.50 |
| kind-preserve-not-behavior | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| mail-question-between-projects | 0.50, 0.75, 0.50 | 0.58 | 0.25 |

## P-2: lose

- Diff: M plugins/core/skills/crew/references/mail.md, M plugins/core/skills/crew/references/receive.md, M plugins/core/skills/crew/references/understand.md
- Rationale: Nothing pins the extended sentences, and every pinned string of the three pages is intact. The edits are complete.

I changed three harness pages and nothing else: `plugins/core/skills/crew/references/receive.md`, `plugins/core/skills/crew/references/understand.md` and `plugins/core/skills/crew/references/mail.md`. The failing run of `mail-question-between-projects` scored on `answered` and `b-unchanged` while `asked-b` found no `sent M-… to b (workspace w)` line and the ending failed every judge vote, which is the trace of a lead who read the CRM's field and values straight out of `peer/b/src/customers.mjs` instead of asking project b: the request says the user does not know the field and is not there to answer, Receive step 3 told the lead to wait for the user and ask "and nothing else", the Understand page told it to wait and end the turn, the skill's rule 5 routes every doubt to `crew question` or a decision, and the Mail page said how to send a question but never when, so a peer checkout on disk looked like the quicker source and the only one left with the user away. The Receive page now says, where it lists the doubts, that a fact another project of the workspace owns is that project's to answer and not the user's, sent as a `question` by mail the moment the request shows it missing and never read out of that project's checkout or guessed, and its step 3 says such a question is not one the item waits for the user over; the Understand page's waiting paragraph carries the same rule in one sentence; and the Mail page's Sending section gains a paragraph on when a question is sent, why a hand reading of a peer's source is a guess with no record while the reply is on record in both mailboxes, that in a session nobody prompts again the lead goes on with what does not need the answer and reads the inbox until the reply is listed rather than ending the turn on the wait, and that the brief cites the reply by its message id and the delivery says the question was sent to 
- Probe set: decision-register-reread, gap-redirect-target, gate-scoped-to-change, judgement-gate-not-run, kind-preserve-not-behavior, mail-question-between-projects
- Gain: 0.00

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| decision-register-reread | 0.50, 1.00, 0.75 | 0.75 | 0.50 |
| gap-redirect-target | 1.00, 1.00, 0.00 | 0.67 | 1.00 |
| gate-scoped-to-change | 0.60, 0.60, 0.60 | 0.60 | 0.00 |
| judgement-gate-not-run | 1.00, 0.50, 0.50 | 0.67 | 0.50 |
| kind-preserve-not-behavior | 1.00, 0.50, 1.00 | 0.83 | 0.50 |
| mail-question-between-projects | 0.75, 0.50, 0.75 | 0.67 | 0.25 |

## Outcome

- Composition: none
- Kept: nothing
- Lessons: K-169, K-170
- Cases no run has measured (never probed): mail-refused-by-policy, no-environment-cannot-prove, pack-agentic-os-absent, pack-agentic-os-seats-the-team, pack-laravel-absent, pack-laravel-refines-the-gates, personalities-differ, priority-lowered-with-reason, proven-test-first, risk-escalation, root-cause-not-repeated, rounds-bounded, strategy-declares-phases, strategy-rejects-over-engineering, task-implementer-worktree, team-by-route, thread-with-contracts, ticket-triaged-against-business, unknown-stack, validator-unattended-approval
- Cost: 44.67 USD
- Exit status: 0
