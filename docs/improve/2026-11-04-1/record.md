# Improvement run 2026-11-04-1

- At: 2026-11-04T00:00:06.746Z
- Targets: pack-agentic-os-absent, pack-agentic-os-seats-the-team
- Provider: runtime (agent claude-sonnet-5-5, judge claude-opus-5-5)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| pack-agentic-os-absent | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| pack-agentic-os-seats-the-team | 1.00, 0.75, 1.00 | 0.92 | 0.25 |

## P-1: lose

- Diff: M plugins/core/skills/crew/SKILL.md, M plugins/core/skills/crew/references/deliver.md
- Rationale: I changed two harness pages and nothing else: `plugins/core/skills/crew/SKILL.md` (the Deliver and Learn rows of the method table) and `plugins/core/skills/crew/references/deliver.md` (its opening paragraph). `pack-agentic-os-absent` is listed at mean 1.00 with no evidence, so it is passing and nothing was edited for it. For `pack-agentic-os-seats-the-team`, the `seat` grader is a regex over the trace for the report's Team table row, `| expert | agentic-os | pack wizardingcode-pack-agentic-os (agents/**) |`, which the engine renders in exactly one place, the report (`renderReport` in `evidence.ts`), reached by `crew evidence <id>` or a read of `report.md`; the gate run and `crew team` print the other form, `expert (pack … (agents/**))`, and `crew judgement record` prints only `Proven: <id>`, so a run that passes `knowledge-path` (served by `crew team` or the gate run's `knowledge for the expert:` line) and misses `seat` is one where the lead ended with the judgement record's tail and never printed the report; the failing run read only the skill page and the rubrics, never `deliver.md`, and the skill page's Deliver row said "Say what is proven and what not", which the record's `Proven:` line already answers. The row now says "Print the report; say what it proves and what not" beside `crew evidence <id>`, and to stay under the page's 9254-byte cap (every test pins it) the Learn row lost its `references/learn.md` parenthetical, which the other-routes table still carries (both pinned strings `| Learn | \`references/learn.md\` |` and `crew learn <id>` are intact; the page is now 9245 bytes by regex probe, down from 9251). The Deliver page's first paragraph now says to run `crew evidence <id>` first, on every route and whatever the verdict, because the gate run and the judgement record print the tail and the team line, never the report, and the delivery is written from the report as printed (its Team table with each seat's reason, its knowledge files, Gap round, Tasks and
- Probe set: pack-agentic-os-absent, pack-agentic-os-seats-the-team
- Gain: 0.08

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| pack-agentic-os-absent | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| pack-agentic-os-seats-the-team | 1.00, 1.00, 1.00 | 1.00 | 0.00 |

## P-2: unprobed (the probe set (2 cases, about 4.08 USD by the baseline's costs) is above what is left under the ceiling (4.07 USD); not probed)

- Diff: M plugins/core/skills/crew/SKILL.md
- Rationale: I changed one harness page and nothing else: `plugins/core/skills/crew/SKILL.md`. The `pack-agentic-os-absent` case is listed at mean 1.00 with no evidence, so it is passing and nothing was edited for it. The `seat` grader of `pack-agentic-os-seats-the-team` is a regex over the trace for the report's Team table row (`| expert | agentic-os | pack wizardingcode-pack-agentic-os (agents/**) |`), which the engine prints only from `crew evidence <id>` or a read of `report.md`; the gate run and `crew team` print the seat in the other form, `expert (pack …)`, and the judgement record prints only `Proven: <id>`. The run that lost `seat` while `knowledge-path`, `rule-added` and the ending passed therefore wrote its delivery from the gate run's tail without printing the report, and its reads were `references/understand.md` and the two rubrics beside the skill page, never `deliver.md`, `conclave.md` or `gate.md`, which is why the earlier edits to the Deliver and Conclave pages never moved this grader. The one page in that run's loop is the skill page, whose Deliver row said only "Say what is proven and what not" and whose rule 1 said "what the report says" without saying the report is something printed. The Deliver row now reads "Print the report; say what it proves and what not", with `crew evidence <id>` as its command, and rule 1 now says "Say what the printed report says: proven, or not proven and why". The page is at its 9254-byte cap, so I paid for the 26 added bytes by dropping "The answers are required; " from rule 6, which its bold command already states and `references/receive.md` repeats; the page measures 9251 or 9252 bytes by regex probe (this session has no shell), every string the skill tests pin is intact, and the absent case's not-contains graders are untouched since the edit names no pack. No evals were re-run.

## Outcome

- Composition: none
- Kept: nothing
- Lessons: K-302
- Cases no run has measured (never probed): none
- Cost: 15.93 USD
- Exit status: 0
