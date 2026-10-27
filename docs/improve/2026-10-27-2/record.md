# Improvement run 2026-10-27-2

- At: 2026-10-27T01:00:07.347Z
- Targets: personalities-differ, priority-lowered-with-reason
- Provider: runtime (agent claude-sonnet-5-5, judge claude-fable-5-1)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| personalities-differ | 0.80, 1.00, 1.00 | 0.93 | 0.20 |
| priority-lowered-with-reason | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| pack-laravel-absent | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| brief-per-todo | 0.40, 1.00, 1.00 | 0.80 | 0.60 |
| cto-report-from-records | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| decision-register-reread | 0.75, 0.75, 0.75 | 0.75 | 0.00 |
| jev-tightens-never-loosens | 0.75, 1.00, 1.00 | 0.92 | 0.25 |
| judgement-gate-not-run | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| pack-agentic-os-absent | 1.00, 1.00, 1.00 | 1.00 | 0.00 |

## P-1: lose

- Diff: M plugins/core/skills/crew/references/deliver.md
- Rationale: I changed one harness page and nothing else: `plugins/core/skills/crew/references/deliver.md`, item 3's paragraph on what the report carries. The `proposals-differ` grader judges the final message alone and wants at least two storage designs, each proposed by an expert or named as a rejected alternative with its reason, plus the design the judge closed on; the three personality graders passed in the failing run, so the debate ran and the ending dropped it. That fits the harness as it stood: the engine's report prints only `Debate: opened (<reason>), closed` in its Gap round section and never the proposals, the Conclave page's "one screen to the user" is a mid-debate step that an unattended run passes through before building, and the Deliver page told the lead to say the decisions, the waivers, the tasks and the mail from the report without a word about the debate, so a lead writing its delivery from the report named the built design and nothing else. The paragraph now says that when the report's `Debate:` line says opened, the message is written from `conclave/proposals.md` and `conclave/judge.md`: one line per proposal with its lens, its design and its `Alternative rejected:` with the reason, then the ruling and the design the judge closed on, and that a message naming the built design alone reports no debate. The pinned sentences of the page (the resumed lead's reply file, the archived round, the "Tasks" and "Mail" sections, the findings file, `crew learn <id>`) are untouched, and the page has no size cap.
- Probe set: pack-laravel-absent, personalities-differ, priority-lowered-with-reason
- Gain: -0.40

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| pack-laravel-absent | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| personalities-differ | 1.00, 0.80, 0.40 | 0.73 | 0.60 |
| priority-lowered-with-reason | 1.00, 1.00, 1.00 | 1.00 | 0.00 |

## P-2: lose

- Diff: M plugins/core/skills/crew/references/conclave.md, M plugins/core/skills/crew/references/deliver.md, M plugins/core/skills/crew/references/learn.md
- Rationale: I changed three harness pages and nothing else: `plugins/core/skills/crew/references/deliver.md`, `plugins/core/skills/crew/references/learn.md` and `plugins/core/skills/crew/references/conclave.md`. The `proposals-differ` grader of `personalities-differ` judges the final message alone, and the three regex graders for the personality headers passed in the same run, so the experts argued under their three lenses and the proposals with their `Alternative rejected:` lines reached `conclave/proposals.md`; what dropped them was the ending. The harness as it stood made that the natural result: the Conclave's step 5 shows the proposals and alternatives on a screen that goes by mid-run while the prompt's user is away, the Deliver page's items said what changed and what is proven but never the debate (the report's own `Debate:` line, rendered by the engine, gives only the reason and the close), and both Deliver's step 6 and Learn's closing section told the lead to "say what entered the base" as a step of its own, so an unattended run's last message was the chosen design or the knowledge entry with no alternative weighed, which is exactly what the judge fails. Deliver's item 3 paragraph now says that when a debate ran the lead says it from `conclave/proposals.md` and `conclave/judge.md`, a line per proposal with the design each expert proposed under its personality, its rejected alternative with the reason, and the proposal the judge closed on; Deliver's step 6 and Learn's section 3 say the learn line is the last line of the same delivery message, never a message of its own; and Conclave's step 5 gained one clause telling an unattended run that the delivery repeats the proposals, alternatives and ruling. Every pinned sentence (step 5's "each proposal's rejected alternative and why" on its own line, the Deliver page's resumed-lead rules, `crew learn <id>`, the Learn page's section 4) is intact, and nothing in the engine or the tests quotes the sentences I extended.
- Probe set: brief-per-todo, cto-report-from-records, decision-register-reread, jev-tightens-never-loosens, judgement-gate-not-run, pack-agentic-os-absent, pack-laravel-absent, personalities-differ, priority-lowered-with-reason
- Gain: -0.20

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| brief-per-todo | 1.00, 1.00, 0.80 | 0.93 | 0.20 |
| cto-report-from-records | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| decision-register-reread | 0.75, 0.75, 0.75 | 0.75 | 0.00 |
| jev-tightens-never-loosens | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| judgement-gate-not-run | 0.50, 1.00, 0.50 | 0.67 | 0.50 |
| pack-agentic-os-absent | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| pack-laravel-absent | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| personalities-differ | 1.00, 1.00, 0.80 | 0.93 | 0.20 |
| priority-lowered-with-reason | 1.00, 1.00, 1.00 | 1.00 | 0.00 |

## Outcome

- Composition: none
- Kept: nothing
- Lessons: K-209, K-210
- Cases no run has measured (never probed): proven-test-first, risk-escalation, root-cause-not-repeated, rounds-bounded, strategy-declares-phases, strategy-rejects-over-engineering, task-implementer-worktree, team-by-route, thread-with-contracts, ticket-triaged-against-business, unknown-stack, validator-unattended-approval
- Cost: 58.29 USD
- Exit status: 0
