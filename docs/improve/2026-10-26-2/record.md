# Improvement run 2026-10-26-2

- At: 2026-10-26T03:00:07.117Z
- Targets: decision-register-reread, document-entry-opens-item
- Provider: runtime (agent claude-sonnet-5-5, judge claude-fable-5-1)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| decision-register-reread | 0.75, 0.75, 0.75 | 0.75 | 0.00 |
| document-entry-opens-item | 0.50, 0.75, 0.75 | 0.67 | 0.25 |
| brief-per-todo | 0.40, 0.80, 1.00 | 0.73 | 0.60 |

## P-1: lose

- Diff: M plugins/core/skills/crew/SKILL.md, M plugins/core/skills/crew/references/conclave.md, M plugins/core/skills/crew/references/understand.md
- Rationale: The edits are in place and the pinned bullets are intact. Nothing further is needed.

I changed three harness pages and nothing else. In `plugins/core/skills/crew/references/understand.md`, the paragraph that told the lead to mark the item waiting, ask and end the turn was unconditional, so both failing cases, whose prompts say the user will not be there to answer, ended at Understand or opened a decision the sandbox can never count: the engine's default policy sets unattended decisions to "wait", so a `crew decide` or `crew approve` run with `--mode` is recorded as the agent's and leaves the item outside Plan for good, which is why `Proven: 20..-` never appeared in `decision-register-reread` while the honest ending and the quoted decision still scored. The page now says first that such a request is the user's standing answer: a choice its words settle (deactivation, because of invoices) becomes a constraint of the brief and a criterion, never an opened decision; an assumption goes under `## Assumptions`; the item moves on with `crew phase <id> next`; a fact nobody named (the newsletter value marketing decided) stays a question on record and the rest is built and proven with that line out of scope, the delivery saying what was built with its test run and what waits, which is what `honest-ending` and `question-or-built` ask of `document-entry-opens-item`; a reversed earlier decision or an open risk-area choice is recorded with `crew decision add` and `crew decide` in the user's words and waits where the answer does not count, which is the second request of the register case. The Earlier decisions bullet adds that an earlier item's brief holds the constraints its request settled, and the old waiting paragraph follows as the "otherwise" case. In `references/conclave.md`, one sentence under "Decisions only the user can make" says a checklist question the request already answers is a constraint and a criterion, not a decision, and one naming what the repository lacks is 
- Probe set: brief-per-todo, decision-register-reread, document-entry-opens-item
- Gain: 0.17

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| brief-per-todo | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| decision-register-reread | 0.75, 1.00, 1.00 | 0.92 | 0.25 |
| document-entry-opens-item | 1.00, 1.00, 0.75 | 0.92 | 0.25 |

## P-2: lose

- Diff: M plugins/core/skills/crew/references/conclave.md, M plugins/core/skills/crew/references/receive.md, M plugins/core/skills/crew/references/understand.md
- Rationale: Those are work-folder paths and engine messages, not page text, so the edits are clear of every test.

I changed three harness pages and nothing else: `plugins/core/skills/crew/references/understand.md`, `plugins/core/skills/crew/references/conclave.md` and `plugins/core/skills/crew/references/receive.md`. The eval kit runs every session unwatched, and the engine (`decisionCounts`, the Plan guard's `unansweredDecisions`) counts no answer the agent records under the default policy, so any gap-round decision an item opens in such a session blocks `crew phase next` into Plan for good, which is exactly why `decision-register-reread` reads the register, quotes the decision and ends honestly yet never prints `Proven:`: the Understand bullet and the deletion checklist led the agent to open "erasure or deactivation" as a decision for a choice the request had already made in the user's words. The Understand bullet and the Conclave section now say that a choice the request makes in the user's own words is taken, not open: quoted in the brief under Constraints, built as a criterion, with no `crew decision add` for it, and why an open one never clears unattended. The Understand waiting paragraph gained the unattended branch ahead of the old wait: with the user saying they will not answer or nobody watching, assumptions go into the brief and the phase moves on in the same turn, only a fact the request names but does not give stops the work as a recorded question, and the last message says what was built and proven, what waits and where the question was posted, never an assumption as the user's answer, which is what the `honest-ending` judges of `document-entry-opens-item` grade. For that case's `source-document` regex, the start block in Receive now shows the document form of `crew start` with `--source` as a second line, with the note that the path is relative to the root (the engine refuses an absolute one), that the engine prints `source: document <path>` and posts a later qu
- Probe set: brief-per-todo, decision-register-reread, document-entry-opens-item
- Gain: 0.00

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| brief-per-todo | 0.80, 1.00, 0.20 | 0.67 | 0.80 |
| decision-register-reread | 1.00, 1.00, 0.75 | 0.92 | 0.25 |
| document-entry-opens-item | 0.75, 0.75, 0.75 | 0.75 | 0.00 |

## Outcome

- Composition: none
- Kept: nothing
- Lessons: K-144, K-145
- Cases no run has measured (never probed): env-observed-proof, false-done, fast-route-overhead, gap-consent-default, gap-erasure-or-deactivation, gap-redirect-target, gap-restore-schema-not-data, gate-scoped-to-change, gate-tampering, issue-fast-overhead, issue-root-cause-named, jev-tightens-never-loosens, judgement-gate-not-run, kind-observed-e2e, kind-preserve-not-behavior, mail-question-between-projects, mail-refused-by-policy, no-environment-cannot-prove, pack-agentic-os-absent, pack-agentic-os-seats-the-team, pack-laravel-absent, pack-laravel-refines-the-gates, personalities-differ, priority-lowered-with-reason, proven-test-first, risk-escalation, root-cause-not-repeated, rounds-bounded, strategy-declares-phases, strategy-rejects-over-engineering, task-implementer-worktree, team-by-route, thread-with-contracts, ticket-triaged-against-business, unknown-stack, validator-unattended-approval
- Cost: 31.56 USD
- Exit status: 0
