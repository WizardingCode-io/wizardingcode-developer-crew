# Improvement run 2026-10-26-12

- At: 2026-10-26T21:00:05.820Z
- Targets: pack-agentic-os-absent, pack-agentic-os-seats-the-team
- Provider: runtime (agent claude-sonnet-5-5, judge claude-fable-5-1)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| pack-agentic-os-absent | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| pack-agentic-os-seats-the-team | 1.00, 1.00, 0.75 | 0.92 | 0.25 |
| brief-per-todo | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| decision-register-reread | 0.75, 0.75, 1.00 | 0.83 | 0.25 |
| jev-tightens-never-loosens | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| judgement-gate-not-run | 0.50, 1.00, 1.00 | 0.83 | 0.50 |

## P-1: lose

- Diff: M plugins/core/skills/crew/references/conclave.md, M plugins/core/skills/crew/references/deliver.md
- Rationale: The size cap applies to SKILL.md alone, which I did not touch, and neither edited page names the pack or its file, so the absent case's not-contains graders stay clear. The edits are complete.

I changed two harness pages and nothing else: `plugins/core/skills/crew/references/conclave.md` and `plugins/core/skills/crew/references/deliver.md`. The `knowledge-path` grader of `pack-agentic-os-seats-the-team` is a regex over the whole trace for `knowledge/agentic.md`, and the engine prints that string in only three places: the `knowledge for the expert:` line of `crew team <id>`, the output of `crew pack files knowledge --item <id>` (a debate step this feature never reaches), and the report's `Knowledge files for the expert` line, which `crew evidence <id>` or a read of `report.md` brings into the trace. The seat grader passed in the failing run while the path was missing, which fits a lead who took the seats from the prompt hook's status line or from `crew status --json` (whose `team` field carries the seats but no knowledge file), launched the QA lead without ever running `crew team`, and ended with a team table written from that rather than from the report; the Conclave page presented `crew team <id>` as a description of what prints, not a step to run, and the Deliver page described `crew evidence <id>` the same way and asked for gates and criteria in item 2 with no word about the team or the pack's file. The leads' validation paragraph now says to run `crew team <id>` rather than read the seats off the status line, and that its output carries the expert's knowledge file path when a registered pack serves one, which the debate's experts get and the delivery names; the Deliver page now says to run `crew evidence <id>` before writing and to write from the report, and item 2 asks for who proved the work: the report's Team table and, when the report has the line, the pack's file by its `<pack>:knowledge/<key>.md` label, with nothing named when no pack served one, so the a
- Probe set: brief-per-todo, decision-register-reread, jev-tightens-never-loosens, judgement-gate-not-run, pack-agentic-os-absent, pack-agentic-os-seats-the-team
- Gain: -0.33

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| brief-per-todo | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| decision-register-reread | 0.50, 0.75, 0.75 | 0.67 | 0.25 |
| jev-tightens-never-loosens | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| judgement-gate-not-run | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| pack-agentic-os-absent | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| pack-agentic-os-seats-the-team | 0.75, 0.75, 1.00 | 0.83 | 0.25 |

## P-2: lose

- Diff: M plugins/core/skills/crew/references/conclave.md, M plugins/core/skills/crew/references/deliver.md
- Rationale: I changed two harness pages and nothing else: `plugins/core/skills/crew/references/conclave.md` and `plugins/core/skills/crew/references/deliver.md`. The failing grader `knowledge-path` of `pack-agentic-os-seats-the-team` is a regex over the trace for `knowledge/agentic.md`, which the engine prints in exactly three places: the `crew team <id>` output (its `knowledge for the expert:` line, served from the policy's specialists whether or not a file has changed yet), the report's `Knowledge files for the expert:` line (printed by `crew evidence <id>` or a read of `report.md`), and the expert's `## Knowledge` prompt in a debate that this case never opens; the gate run records the seat and the knowledge files from the same pack listing, so a run that passes `seat` and misses `knowledge-path` is one where the lead launched the leads without running `crew team` and wrote its delivery from the gate run's `Proven:` tail without printing the report, the same shape the SP6 record saw on the Laravel pair ("the agent never ran `crew team`, the one command that printed the expert's knowledge files"). The Conclave page described `crew team <id>` as something that "prints the seats" rather than as a step to run, and the Deliver page said `crew evidence <id>` "prints it" in passing and never named the packs or the expert's files among what the message says. The leads' validation step now says to run `crew team <id>`, that it prints the seats, the template and the knowledge files the expert reads, and that the seats come from that output and are never guessed from the route; the Deliver page now says to run `crew evidence <id>` first and write the message from what it prints, never from the gate tail alone, and item 2 names the packs the item used and the expert's knowledge files as the report's Packs and Knowledge lines name them, with "no pack" when the report says none, so the absent case (which must never show the path) is unaffected and the literal path appears nowhere in the ha
- Probe set: brief-per-todo, decision-register-reread, jev-tightens-never-loosens, judgement-gate-not-run, pack-agentic-os-absent, pack-agentic-os-seats-the-team
- Gain: -0.42

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| brief-per-todo | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| decision-register-reread | 1.00, 1.00, 0.75 | 0.92 | 0.25 |
| jev-tightens-never-loosens | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| judgement-gate-not-run | 1.00, 1.00, 0.00 | 0.67 | 1.00 |
| pack-agentic-os-absent | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| pack-agentic-os-seats-the-team | 0.50, 0.75, 1.00 | 0.75 | 0.50 |

## Outcome

- Composition: none
- Kept: nothing
- Lessons: K-205, K-206
- Cases no run has measured (never probed): pack-laravel-absent, pack-laravel-refines-the-gates, personalities-differ, priority-lowered-with-reason, proven-test-first, risk-escalation, root-cause-not-repeated, rounds-bounded, strategy-declares-phases, strategy-rejects-over-engineering, task-implementer-worktree, team-by-route, thread-with-contracts, ticket-triaged-against-business, unknown-stack, validator-unattended-approval
- Cost: 42.40 USD
- Exit status: 0
