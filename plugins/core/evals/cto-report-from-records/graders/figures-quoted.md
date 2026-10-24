---
type: llm
focus: { source: file, path: cto-plan.md }
---

The file is the CTO's plan. The engine's figures for this workspace, as `crew cto review --workspace w` prints them from the fixture's records: 2 projects; items 3 when the review item is opened after the review, 4 when it is opened first (all on the fast route, all of kind feature); rounds: judgement 0, validation 0, gate 0; tokens 0; decisions 0; gates 0 not run, 0 skipped; knowledge 4 entries (stack-preference 1, validated-solution 3), confirmed 1, contradicted 1, cited by 1 item.
PASS if the plan's section `## What the figures say` carries at least two numbers, and every number in it that names one of those figures equals it (either item count, used consistently). A count the CTO derived from the reports it read (reports found, criteria per item, minutes) is not one of them and is neither required nor counted against the plan.
FAIL if the section gives one of those figures another value, carries no number, or the file holds no such section.
