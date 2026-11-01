# Improvement run 2026-11-01-2

- At: 2026-11-01T13:00:07.113Z
- Targets: spec-brainstorm-open, spec-draft-owner
- Provider: runtime (agent claude-sonnet-5-5, judge claude-opus-5-5)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| spec-brainstorm-open | 0.67, 0.67, 1.00 | 0.78 | 0.33 |
| spec-draft-owner | 1.00, 1.00, 1.00 | 1.00 | 0.00 |

## P-1: unprobed (the probe set (31 cases, about 194.25 USD by the baseline's costs) is above what is left under the ceiling (16.15 USD); not probed)

- Diff: M plugins/core/skills/crew/references/receive.md, M plugins/core/skills/crew/references/understand.md
- Rationale: I changed two harness pages and nothing else: `plugins/core/skills/crew/references/receive.md` (one sentence in step 3, "Ask what is missing") and `plugins/core/skills/crew/references/understand.md` (one sentence in the paragraph that marks the wait and asks). The `asks-open-question` grader of `spec-brainstorm-open` judges the final message alone and fails a menu of options, while the case's other two graders (no brief written, no reviewer launched) passed in the failing runs, so the lead asked but asked as a multiple choice. The harness as it stood made that the natural result: the session-start hook sends a session with no item to the crew skill's nine questions and `crew start`, "add webhooks" is vague and touches a public API, so the item lands on the full route, and from there the pages the lead reads say the opposite of the brainstorm skill: Receive step 3 says to ask the questions whose answers change the build and fit them on one screen, Understand says to write assumptions as statements to refuse and decisions as direct questions with a default, and rule 4 of the skill page says every decision is presented with a proposed default. A lead merging those with the brainstorm's "open questions, one at a time, no canned options" writes "inbound or outbound, default outbound?", which the judge fails. Neither page in my folders named the brainstorm at all, and the brainstorm skill itself is outside the folders I may edit. Receive step 3 now says that a brainstorm (the user asked for one, or a feature or new project on the full route, whose guard into specify wants its brief) asks one open question about the problem at a time, in plain chat, with no menu of options, no default, no example answers and no second question on the same screen, and that a choice between named designs is the gap round's decision, recorded later, never offered as a list to pick from; Understand's wait paragraph says the brainstorm's drill comes before that screen, in the same terms, and th

## P-2: unprobed (the probe set (31 cases, about 194.25 USD by the baseline's costs) is above what is left under the ceiling (13.82 USD); not probed)

- Diff: M plugins/core/skills/crew/references/receive.md, M plugins/core/skills/crew/references/understand.md
- Rationale: The size caps are on the crew skill page, the checklists, the rubrics and the frontend standard, none of which I touched. The two reference pages have no cap, and every pinned sentence on them is intact since I only inserted text. The edits are complete and I haven't run anything.

I changed two harness pages and nothing else: `plugins/core/skills/crew/references/receive.md` (a new paragraph in step 3, after the fast-route line) and `plugins/core/skills/crew/references/understand.md` (a new line before "Mark the work as waiting"). The `asks-open-question` grader of `spec-brainstorm-open` is a judge over the session that passes only an open question about the problem and fails any menu of options or canned answers, and the case's other two graders (no brief, no goldfish launched) are not reported failing, so the two dropped runs asked, but asked with a choice. The harness as it stood led there: a webhooks feature touches the public API and routes full, the brainstorm skill itself says "open questions, one at a time, with no canned options" but needs an item, so the lead runs `crew start` and reads Receive, whose step 3 said to ask the questions "on one screen" and whose rule 4 and Understand bullets frame every question as a statement to confirm or refuse or a decision recorded with a stated default, and the Conclave page gives an architecture question "up to three options"; a lead following those pages asks "outbound, inbound or both?" with a default, which the judge reads as multiple choice. Receive step 3 now says that a request the user asked to brainstorm, or a feature or new project on the full route whose brief the guard requires, takes the brainstorm's questions first: open, in plain words, one at a time, about the problem, with no list of options, no lettered choices, no default and no assumptions to confirm, and that a choice between designs is the gap round's decision asked later with its options, with no brief written and no reviewer launched until the an

## Outcome

- Composition: none
- Kept: nothing
- Lessons: none
- Cases no run has measured (never probed): spec-draft-write, spec-drift-detect, spec-isolation, spec-loop-rules, spec-resolve-rules, spec-review-planted
- Cost: 6.18 USD
- Exit status: 0
