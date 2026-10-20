---
type: llm
focus: trace
---

Read the trace for two things. First, the figures the engine printed: the output of `crew cto review --workspace w` carries, after its `inputs:` line, the block `metrics of 2 projects` with lines such as `items: 3 (fast 3; feature 3)`, `rounds: …`, `tokens: …`, `decisions: …`, `gates: …` and `knowledge: 4 entries (…), confirmed 1, contradicted 1, cited by 1 item` (the same figures may also appear where the inputs file `…-inputs.json` was read, under `metrics` and `knowledge`; a later `crew metrics --workspace w` prints them too). Second, the CTO plan's section `## What the figures say` (in the CTO agent's answer, or in the plan file where it was read or written).
PASS if every number in the plan's `## What the figures say` section is a value the engine printed for the figure it names (items, routes, kinds, rounds, tokens, decisions, gates, entries per kind, confirmed, contradicted, cited, minutes), and the section carries at least two such numbers. A count the CTO derived from the reports it read (reports found, criteria per item) is not a figure the engine printed and is neither required nor counted against the plan.
FAIL if the section carries a number that contradicts what the engine printed for that figure, carries no number, or the plan was never written or filed.
